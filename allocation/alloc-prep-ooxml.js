/* Prepline — build Plated prep-list xlsx by cloning master sheet OOXML.
 * Copies sheet XML + styles (merged across masters) + sharedStrings + drawings/media.
 * Patches only event label + pax; updates formula cached <v> from SheetJS recalc.
 * Falls back callers should still run AllocPrepList.buildPrepList for matching.
 */
(function (root) {
  'use strict';

  var NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var NS_OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var CT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
  var CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';

  function ensureJSZip() {
    if (root.JSZip) return Promise.resolve(root.JSZip);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var base = root.__PREPLINE_VENDOR_BASE__ || '../';
      s.src = base.replace(/\/?$/, '/') + 'vendor/jszip/jszip.min.js';
      s.onload = function () {
        if (root.JSZip) resolve(root.JSZip);
        else reject(new Error('JSZip loaded but missing'));
      };
      s.onerror = function () { reject(new Error('Could not load JSZip')); };
      document.head.appendChild(s);
    });
  }

  function u8(buf) {
    if (!buf) return null;
    if (buf instanceof Uint8Array) return buf;
    if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
    if (ArrayBuffer.isView && ArrayBuffer.isView(buf)) {
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    return null;
  }

  function xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function basename(p) {
    var s = String(p || '').replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function normalizeSheetPath(target) {
    if (!target) return '';
    var t = String(target).replace(/^\//, '');
    if (t.indexOf('xl/') === 0) return t;
    if (t.indexOf('worksheets/') === 0) return 'xl/' + t;
    return 'xl/' + t.replace(/^\.\.\//, '');
  }

  /** Extract inner items of <tag>...</tag> preserving each item's outer XML. */
  function extractItems(block, itemTag) {
    if (!block) return [];
    var re = new RegExp('<' + itemTag + '\\b[^>]*/>|<' + itemTag + '\\b[^>]*>[\\s\\S]*?</' + itemTag + '>', 'g');
    return block.match(re) || [];
  }

  function extractSection(stylesXml, tag) {
    var re = new RegExp('<' + tag + '\\b([^>]*)>([\\s\\S]*?)</' + tag + '>', 'i');
    var m = re.exec(stylesXml);
    if (!m) {
      // self-closing
      var re2 = new RegExp('<' + tag + '\\b([^>]*)/>', 'i');
      var m2 = re2.exec(stylesXml);
      if (m2) return { attrs: m2[1] || '', inner: '', full: m2[0], selfClose: true };
      return null;
    }
    return { attrs: m[1] || '', inner: m[2] || '', full: m[0], selfClose: false };
  }

  function countAttr(attrs, defCount) {
    var m = /count="(\d+)"/.exec(attrs || '');
    return m ? +m[1] : defCount;
  }

  function parseStyles(stylesXml) {
    var fonts = extractSection(stylesXml, 'fonts');
    var fills = extractSection(stylesXml, 'fills');
    var borders = extractSection(stylesXml, 'borders');
    var cellXfs = extractSection(stylesXml, 'cellXfs');
    var numFmts = extractSection(stylesXml, 'numFmts');
    var fontItems = fonts ? extractItems(fonts.inner, 'font') : [];
    var fillItems = fills ? extractItems(fills.inner, 'fill') : [];
    var borderItems = borders ? extractItems(borders.inner, 'border') : [];
    var xfItems = cellXfs ? extractItems(cellXfs.inner, 'xf') : [];
    var numFmtItems = numFmts ? extractItems(numFmts.inner, 'numFmt') : [];
    return {
      xml: stylesXml,
      fonts: fontItems,
      fills: fillItems,
      borders: borderItems,
      xfs: xfItems,
      numFmts: numFmtItems,
      fontsSec: fonts,
      fillsSec: fills,
      bordersSec: borders,
      cellXfsSec: cellXfs,
      numFmtsSec: numFmts
    };
  }

  /** Append stylesB onto stylesA; return {xml, offsetB:{fonts,fills,borders,xfs,sst}} */
  function mergeStylesXml(stylesA, stylesB) {
    var a = parseStyles(stylesA);
    var b = parseStyles(stylesB);
    var fontOff = a.fonts.length;
    var fillOff = a.fills.length;
    var borderOff = a.borders.length;
    var xfOff = a.xfs.length;

    // Remap xf ids inside B's xfs
    var remappedXfs = b.xfs.map(function (xf) {
      return xf
        .replace(/\bfontId="(\d+)"/g, function (_, id) {
          return 'fontId="' + (+id + fontOff) + '"';
        })
        .replace(/\bfillId="(\d+)"/g, function (_, id) {
          return 'fillId="' + (+id + fillOff) + '"';
        })
        .replace(/\bborderId="(\d+)"/g, function (_, id) {
          return 'borderId="' + (+id + borderOff) + '"';
        });
      // xfId stays pointing at cellStyleXfs[0] from A
    });

    var fonts = a.fonts.concat(b.fonts);
    var fills = a.fills.concat(b.fills);
    var borders = a.borders.concat(b.borders);
    var xfs = a.xfs.concat(remappedXfs);
    var numFmts = a.numFmts.concat(b.numFmts);

    var xml = stylesA;
    function replaceSec(tag, items, preferA) {
      var sec = preferA;
      var inner = items.join('');
      var neu = '<' + tag + ' count="' + items.length + '">' + inner + '</' + tag + '>';
      if (sec && sec.full) {
        xml = xml.replace(sec.full, neu);
      } else if (tag === 'numFmts' && items.length) {
        // insert before fonts
        xml = xml.replace(/<fonts\b/, neu + '<fonts');
      }
    }
    replaceSec('fonts', fonts, a.fontsSec);
    replaceSec('fills', fills, a.fillsSec);
    replaceSec('borders', borders, a.bordersSec);
    replaceSec('cellXfs', xfs, a.cellXfsSec);
    if (numFmts.length) {
      if (a.numFmtsSec && a.numFmtsSec.full) {
        xml = xml.replace(
          a.numFmtsSec.full,
          '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts>'
        );
      } else {
        xml = xml.replace(/<fonts\b/, '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts><fonts');
      }
    }
    return {
      xml: xml,
      offsetB: { fonts: fontOff, fills: fillOff, borders: borderOff, xfs: xfOff }
    };
  }

  function parseSst(sstXml) {
    if (!sstXml) return { items: [], xml: '' };
    // Match <si>...</si>
    var items = sstXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
    return { items: items, xml: sstXml };
  }

  function buildSst(items) {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' +
      items.length +
      '" uniqueCount="' +
      items.length +
      '">' +
      items.join('') +
      '</sst>'
    );
  }

  function remapSheetStyles(sheetXml, xfOff) {
    if (!xfOff) return sheetXml;
    return sheetXml.replace(/\bs="(\d+)"/g, function (_, id) {
      return 's="' + (+id + xfOff) + '"';
    });
  }

  function remapSheetSst(sheetXml, sstOff) {
    sstOff = sstOff || 0;
    // Masters store empty cells as <c .../>. A naive <c ...>(.*?)</c> regex treats the
    // ">" of "/>" as the open tag end and swallows the NEXT real cell until </c>, so
    // t="s" titles (B1) never get their SST index offset → Pea title becomes "KG".
    // Match self-closing first; only then open/close pairs.
    return sheetXml.replace(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g, function (full, selfAttrs, openAttrs, body) {
      if (selfAttrs != null && openAttrs == null) return full;
      var attrs = openAttrs;
      if (/<f[\s>]/.test(body)) return full;
      if (/\bt="s"/.test(attrs)) {
        if (!sstOff) return full;
        var body2 = body.replace(/<v>(\d+)<\/v>/g, function (_, n) {
          return '<v>' + (+n + sstOff) + '</v>';
        });
        return '<c' + attrs + '>' + body2 + '</c>';
      }
      var vm = /^[\s]*<v>(\d+)<\/v>[\s]*$/.exec(body);
      if (!/\bt=/.test(attrs) && vm) {
        return '<c' + attrs + ' t="s"><v>' + (+vm[1] + sstOff) + '</v></c>';
      }
      return full;
    });
  }

  /** Column index 1-based from A=1. */
  function colIndex(col) {
    var n = 0;
    var s = String(col || '').toUpperCase();
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n;
  }

  /** Insert cellXml into row in ascending column order (GS ignores out-of-order cells). */
  function insertCellInRow(sheetXml, addr, cellXml) {
    var rowM = /^([A-Z]+)(\d+)$/i.exec(addr);
    if (!rowM) return sheetXml;
    var want = colIndex(rowM[1]);
    var rowNum = rowM[2];
    var rowRe = new RegExp('(<row r="' + rowNum + '"[^>]*>)([\\s\\S]*?)(</row>)');
    var rm = rowRe.exec(sheetXml);
    if (!rm) return sheetXml;
    var body = rm[2];
    var inserted = false;
    var newBody = body.replace(/<c r="([A-Z]+)(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g, function (full, cCol) {
      if (inserted) return full;
      if (colIndex(cCol) > want) {
        inserted = true;
        return cellXml + full;
      }
      return full;
    });
    if (!inserted) newBody = body + cellXml;
    return sheetXml.slice(0, rm.index) + rm[1] + newBody + rm[3] + sheetXml.slice(rm.index + rm[0].length);
  }

  /** Replace or set a cell's value in sheet XML. keeps style attr. */
  function patchCell(sheetXml, addr, opts) {
    // opts: {number: n} | {text: s} | {cached: n} for formula cells
    // CRITICAL: match self-closing cells FIRST. The old pattern
    //   <c r="B2"([^>]*?)(/?)>([\s\S]*?)</c>
    // treated "/>" as "/" + ">" and then consumed the NEXT cell until </c>,
    // deleting C2 (pax) when patching B2 (event). Google Sheets then ignored the
    // out-of-order C2 re-inserted at end of row → pax blank, totals 0.
    var reSelf = new RegExp('<c r="' + addr + '"([^>]*?)/>');
    var mSelf = reSelf.exec(sheetXml);
    if (mSelf) {
      var neuSelf = buildCellXml(addr, opts, mSelf[1] || '');
      return sheetXml.slice(0, mSelf.index) + neuSelf + sheetXml.slice(mSelf.index + mSelf[0].length);
    }
    var reFull = new RegExp('<c r="' + addr + '"([^>]*)>([\\s\\S]*?)<\\/c>');
    var m = reFull.exec(sheetXml);
    if (!m) {
      var cellXml = buildCellXml(addr, opts, ' s="0"');
      return insertCellInRow(sheetXml, addr, cellXml);
    }
    var full = m[0];
    var attrs = m[1] || '';
    var body = m[2] || '';
    var neu;
    // Preserve formula if present when patching cached value only
    if (opts && opts.cached != null && /<f[\s>]/.test(body)) {
      var fMatch = body.match(/<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/);
      var fXml = fMatch ? fMatch[0] : '';
      neu = '<c r="' + addr + '"' + stripType(attrs) + '>' + fXml + '<v>' + xmlEscape(String(opts.cached)) + '</v></c>';
      return sheetXml.slice(0, m.index) + neu + sheetXml.slice(m.index + full.length);
    }
    neu = buildCellXml(addr, opts, attrs);
    return sheetXml.slice(0, m.index) + neu + sheetXml.slice(m.index + full.length);
  }

  function stripType(attrs) {
    return String(attrs || '').replace(/\s*t="[^"]*"/g, '');
  }

  function buildCellXml(addr, opts, attrs) {
    attrs = stripType(attrs || '');
    if (opts && opts.number != null) {
      return '<c r="' + addr + '"' + attrs + '><v>' + opts.number + '</v></c>';
    }
    if (opts && opts.text != null) {
      // inlineStr so we don't need SST slot
      return (
        '<c r="' +
        addr +
        '"' +
        attrs +
        ' t="inlineStr"><is><t>' +
        xmlEscape(opts.text) +
        '</t></is></c>'
      );
    }
    if (opts && opts.cached != null) {
      return '<c r="' + addr + '"' + attrs + '><v>' + opts.cached + '</v></c>';
    }
    return '<c r="' + addr + '"' + attrs + '/>';
  }

  function updateFormulaCaches(sheetXml, values) {
    // values: {ADDR: number|string}
    if (!values) return sheetXml;
    return sheetXml.replace(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g, function (full, addr, attrs, body) {
      if (!/<f[\s>]/.test(body)) return full;
      if (!Object.prototype.hasOwnProperty.call(values, addr)) return full;
      var val = values[addr];
      if (val == null || val === '') return full;
      var fMatch = body.match(/<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/);
      var fXml = fMatch ? fMatch[0] : '';
      var num = typeof val === 'number' || (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val));
      var attrs2 = stripType(attrs);
      if (!num) {
        return (
          '<c r="' +
          addr +
          '"' +
          attrs2 +
          ' t="str">' +
          fXml +
          '<v>' +
          xmlEscape(String(val)) +
          '</v></c>'
        );
      }
      return '<c r="' + addr + '"' + attrs2 + '>' + fXml + '<v>' + val + '</v></c>';
    });
  }

  async function indexMaster(JSZip, buf, sourceName) {
    var zip = await JSZip.loadAsync(u8(buf));
    var wbXml = await zip.file('xl/workbook.xml').async('string');
    var relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    var stylesXml = await zip.file('xl/styles.xml').async('string');
    var sstFile = zip.file('xl/sharedStrings.xml');
    var sstXml = sstFile ? await sstFile.async('string') : '';
    var themeFile = zip.file('xl/theme/theme1.xml');
    var themeXml = themeFile ? await themeFile.async('string') : null;

    var ridTarget = {};
    relsXml.replace(/<Relationship\b([^>]*)\/?>/g, function (_, attrs) {
      var id = /Id="([^"]+)"/.exec(attrs);
      var tgt = /Target="([^"]+)"/.exec(attrs);
      if (id && tgt) ridTarget[id[1]] = tgt[1];
      return '';
    });

    var sheets = {};
    var sheetRe = /<sheet\b([^>]*)\/?>/g;
    var m;
    while ((m = sheetRe.exec(wbXml))) {
      var attrs = m[1];
      var nameM = /name="([^"]+)"/.exec(attrs);
      var ridM = /r:id="([^"]+)"/.exec(attrs);
      if (!nameM || !ridM) continue;
      var name = nameM[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      var target = ridTarget[ridM[1]] || '';
      var sheetPath = normalizeSheetPath(target);
      sheets[name] = { path: sheetPath, rid: ridM[1] };
    }

    return {
      name: sourceName,
      zip: zip,
      stylesXml: stylesXml,
      sstXml: sstXml,
      sst: parseSst(sstXml),
      themeXml: themeXml,
      sheets: sheets
    };
  }

  async function loadSheetParts(master, sheetName) {
    var meta = master.sheets[sheetName];
    if (!meta) return null;
    var zip = master.zip;
    var sheetXml = await zip.file(meta.path).async('string');
    var sn = /sheet(\d+)/i.exec(meta.path);
    var sheetNum = sn ? sn[1] : '1';
    var relsPath = 'xl/worksheets/_rels/sheet' + sheetNum + '.xml.rels';
    var relsFile = zip.file(relsPath);
    var relsXml = relsFile ? await relsFile.async('string') : null;
    var drawingPath = null;
    var drawingRelsPath = null;
    var media = []; // {name, data, ext, relId}
    if (relsXml) {
      relsXml.replace(/<Relationship\b([^>]*)\/?>/g, function (_, a) {
        var typ = /Type="([^"]+)"/.exec(a);
        var tgt = /Target="([^"]+)"/.exec(a);
        var rid = /Id="([^"]+)"/.exec(a);
        var typS = typ ? typ[1] : '';
        var tgtS = tgt ? tgt[1] : '';
        if (/drawing/i.test(typS) || /drawings\//i.test(tgtS)) {
          drawingPath = 'xl/drawings/' + basename(tgtS);
          drawingRelsPath = 'xl/drawings/_rels/' + basename(tgtS) + '.rels';
        }
        return '';
      });
    }
    var drawingXml = null;
    var drawingRelsXml = null;
    if (drawingPath && zip.file(drawingPath)) {
      drawingXml = await zip.file(drawingPath).async('string');
      if (drawingRelsPath && zip.file(drawingRelsPath)) {
        drawingRelsXml = await zip.file(drawingRelsPath).async('string');
        var embeds = [];
        drawingRelsXml.replace(/<Relationship\b([^>]*)\/?>/g, function (_, a) {
          var typ = /Type="([^"]+)"/.exec(a);
          var tgt = /Target="([^"]+)"/.exec(a);
          var rid = /Id="([^"]+)"/.exec(a);
          if (!tgt || !rid) return '';
          var typS = typ ? typ[1] : '';
          var tgtS = tgt[1];
          if (/image/i.test(typS) || /media\//i.test(tgtS)) {
            embeds.push({ rid: rid[1], target: tgtS });
          }
          return '';
        });
        for (var i = 0; i < embeds.length; i++) {
          var mp = 'xl/media/' + basename(embeds[i].target);
          if (!zip.file(mp)) continue;
          var data = await zip.file(mp).async('uint8array');
          media.push({
            rid: embeds[i].rid,
            srcPath: mp,
            data: data,
            ext: basename(mp).split('.').pop().toLowerCase()
          });
        }
      }
    }
    return {
      sheetName: sheetName,
      sheetXml: sheetXml,
      relsXml: relsXml,
      drawingXml: drawingXml,
      drawingRelsXml: drawingRelsXml,
      media: media
    };
  }

  function formulaValuesFromWs(ws) {
    var out = {};
    if (!ws) return out;
    Object.keys(ws).forEach(function (addr) {
      if (addr[0] === '!') return;
      var c = ws[addr];
      if (c && c.f != null && c.v != null) out[addr] = c.v;
    });
    return out;
  }

  function layoutFromWs(ws) {
    if (root.AllocPrepList && root.AllocPrepList.layoutOf) {
      return root.AllocPrepList.layoutOf(ws);
    }
    return null;
  }

  function eventLabelFor(row) {
    if (row.eventLabel) return row.eventLabel;
    if (root.AllocPrepList && root.AllocPrepList.fmtEventLabel) {
      return root.AllocPrepList.fmtEventLabel(row.date, row.meal, row.acronym);
    }
    return [row.date, row.meal, row.acronym].filter(Boolean).join(' ');
  }

  /**
   * Build prep xlsx buffer by OOXML-cloning master sheets.
   * opts: {
   *   matched: [{tab, master, pax, date, meal, acronym, ...}],
   *   workbook: SheetJS wb (recalculated sheets named by tab),
   *   masters: [{name, buf, wb}],
   *   bespoke: optional [{tab, xlsxBytes, ws, ...}]
   * }
   */
  async function buildFromMatched(opts) {
    var JSZip = await ensureJSZip();
    opts = opts || {};
    var matched = opts.matched || [];
    var mastersIn = opts.masters || [];
    var workbook = opts.workbook;
    var report = { tabs: [], styleSources: {}, photos: 0, errors: [] };

    // Index masters that have raw buffers
    var indexed = [];
    for (var i = 0; i < mastersIn.length; i++) {
      var m = mastersIn[i];
      if (!m || !m.buf) continue;
      indexed.push(await indexMaster(JSZip, m.buf, m.name || 'master' + i));
    }
    if (!indexed.length) throw new Error('OOXML build needs master raw buffers');

    // Stable style base = first master; merge others in order
    var stylesXml = indexed[0].stylesXml;
    var styleOffsets = {}; // masterName -> xfOff (0 for first)
    styleOffsets[indexed[0].name] = { fonts: 0, fills: 0, borders: 0, xfs: 0, sst: 0 };
    var sstItems = indexed[0].sst.items.slice();
    var sstOffsets = {};
    sstOffsets[indexed[0].name] = 0;
    var themeXml = indexed[0].themeXml;

    for (var mi = 1; mi < indexed.length; mi++) {
      var merged = mergeStylesXml(stylesXml, indexed[mi].stylesXml);
      stylesXml = merged.xml;
      var sstOff = sstItems.length;
      sstItems = sstItems.concat(indexed[mi].sst.items);
      styleOffsets[indexed[mi].name] = merged.offsetB;
      styleOffsets[indexed[mi].name].sst = sstOff;
      sstOffsets[indexed[mi].name] = sstOff;
      if (!themeXml && indexed[mi].themeXml) themeXml = indexed[mi].themeXml;
    }

    // Map sheetName -> master index entry (first wins, matching AllocPrepList)
    var sheetOwner = {};
    indexed.forEach(function (ix) {
      Object.keys(ix.sheets).forEach(function (nm) {
        if (!sheetOwner[nm]) sheetOwner[nm] = ix;
      });
    });

    var out = new JSZip();
    var sheetEntries = []; // {name, path, hasDrawing}
    var mediaCount = 0;
    var drawingCount = 0;

    async function addClonedSheet(tabName, masterSheetName, patch) {
      var owner = sheetOwner[masterSheetName];
      if (!owner) {
        report.errors.push({ tab: tabName, error: 'master sheet not in buffers: ' + masterSheetName });
        return false;
      }
      var parts = await loadSheetParts(owner, masterSheetName);
      if (!parts) {
        report.errors.push({ tab: tabName, error: 'could not load ' + masterSheetName });
        return false;
      }
      var off = styleOffsets[owner.name] || { xfs: 0, sst: 0 };
      var xml = parts.sheetXml;
      xml = remapSheetStyles(xml, off.xfs || 0);
      xml = remapSheetSst(xml, off.sst || sstOffsets[owner.name] || 0);

      if (patch) {
        if (patch.eventAddr && patch.eventLabel != null) {
          xml = patchCell(xml, patch.eventAddr, { text: patch.eventLabel });
        }
        if (patch.paxAddr && patch.pax != null) {
          xml = patchCell(xml, patch.paxAddr, { number: patch.pax });
        }
        if (patch.formulaValues) {
          xml = updateFormulaCaches(xml, patch.formulaValues);
        }
      }

      var idx = sheetEntries.length + 1;
      var sheetPath = 'xl/worksheets/sheet' + idx + '.xml';
      var hasDrawing = false;

      // If master sheet has empty/broken drawing, try alias altSheets for photo only
      if (!(parts.media && parts.media.length)) {
        var photoParts = null;
        var tryNames = [];
        if (patch && patch.photoFallbacks) {
          for (var pf = 0; pf < patch.photoFallbacks.length; pf++) {
            if (patch.photoFallbacks[pf] && tryNames.indexOf(patch.photoFallbacks[pf]) < 0) {
              tryNames.push(patch.photoFallbacks[pf]);
            }
          }
        }
        var AL = (root.AllocPrepList && root.AllocPrepList.ALIASES) || [];
        for (var ai = 0; ai < AL.length; ai++) {
          var sheetsA = [AL[ai].sheet].concat(AL[ai].altSheets || []).filter(Boolean);
          if (sheetsA.indexOf(masterSheetName) >= 0) {
            sheetsA.forEach(function (s) {
              if (s !== masterSheetName && tryNames.indexOf(s) < 0) tryNames.push(s);
            });
          }
        }
        for (var ti2 = 0; ti2 < tryNames.length && !photoParts; ti2++) {
          var altOwner = sheetOwner[tryNames[ti2]];
          if (!altOwner) continue;
          var altParts = await loadSheetParts(altOwner, tryNames[ti2]);
          if (altParts && altParts.media && altParts.media.length && altParts.drawingXml) {
            photoParts = altParts;
          }
        }
        if (photoParts) {
          parts.drawingXml = photoParts.drawingXml;
          parts.drawingRelsXml = photoParts.drawingRelsXml;
          parts.media = photoParts.media;
        }
      }

      if (parts.drawingXml && parts.media && parts.media.length) {
        drawingCount++;
        var dName = 'drawing' + drawingCount + '.xml';
        var newRels = [];
        var dXml = parts.drawingXml;
        for (var j = 0; j < parts.media.length; j++) {
          mediaCount++;
          var ext = parts.media[j].ext || 'png';
          var mediaName = 'image' + mediaCount + '.' + ext;
          out.file('xl/media/' + mediaName, parts.media[j].data);
          var newRid = 'rId' + (j + 1);
          newRels.push(
            '<Relationship Id="' +
              newRid +
              '" Type="' +
              NS_OD +
              '/image" Target="../media/' +
              mediaName +
              '"/>'
          );
          // Remap old rid -> newRid in drawing if needed (usually rId1..)
          if (parts.media[j].rid && parts.media[j].rid !== newRid) {
            dXml = dXml.replace(
              new RegExp('r:embed="' + parts.media[j].rid + '"', 'g'),
              'r:embed="' + newRid + '"'
            );
          }
        }
        out.file('xl/drawings/' + dName, dXml);
        out.file(
          'xl/drawings/_rels/' + dName + '.rels',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
            '<Relationships xmlns="' +
            NS_REL +
            '">' +
            newRels.join('') +
            '</Relationships>'
        );
        out.file(
          'xl/worksheets/_rels/sheet' + idx + '.xml.rels',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
            '<Relationships xmlns="' +
            NS_REL +
            '">' +
            '<Relationship Id="rId1" Type="' +
            NS_OD +
            '/drawing" Target="../drawings/' +
            dName +
            '"/>' +
            '</Relationships>'
        );
        // Ensure sheet points at rId1 drawing
        if (!/<drawing\b/.test(xml)) {
          xml = xml.replace(/<\/worksheet>/, '<drawing r:id="rId1"/></worksheet>');
        } else {
          xml = xml.replace(/<drawing\b[^>]*\/>/, '<drawing r:id="rId1"/>');
        }
        hasDrawing = true;
        report.photos++;
      } else {
        // Strip drawing ref if we couldn't copy media
        xml = xml.replace(/<drawing\b[^>]*\/>/, '');
      }

      out.file(sheetPath, xml);
      sheetEntries.push({ name: tabName, path: sheetPath, hasDrawing: hasDrawing, master: masterSheetName, source: owner.name });
      report.tabs.push({ tab: tabName, master: masterSheetName, source: owner.name, photo: hasDrawing });
      report.styleSources[tabName] = owner.name;
      return true;
    }

    for (var ti = 0; ti < matched.length; ti++) {
      var row = matched[ti];
      if (!row || row.bespoke) continue;
      var tab = row.tab;
      var masterName = row.master;
      var ws = workbook && workbook.Sheets ? workbook.Sheets[tab] : null;
      var lay = row.paxAddr
        ? { paxAddr: row.paxAddr, eventAddr: row.eventAddr }
        : layoutFromWs(ws);
      var patch = {
        paxAddr: (lay && lay.paxAddr) || row.paxAddr || 'C2',
        eventAddr: (lay && lay.eventAddr) || row.eventAddr || 'B2',
        pax: row.pax,
        eventLabel: eventLabelFor(row),
        formulaValues: formulaValuesFromWs(ws),
        photoFallbacks: row.photoFallbacks || row.altSheets || null
      };
      await addClonedSheet(tab, masterName, patch);
    }

    // Bespoke: if xlsxBytes, clone first sheet; else skip (caller may SheetJS-merge)
    var bespoke = opts.bespoke || [];
    for (var bi = 0; bi < bespoke.length; bi++) {
      var b = bespoke[bi];
      if (!b) continue;
      var btab = b.tab || b.name;
      if (!btab) continue;
      // already added?
      if (sheetEntries.some(function (s) { return s.name === btab; })) continue;
      if (b.xlsxBytes) {
        try {
          var bzip = await JSZip.loadAsync(u8(b.xlsxBytes));
          var bwb = await bzip.file('xl/workbook.xml').async('string');
          var brels = await bzip.file('xl/_rels/workbook.xml.rels').async('string');
          var brid = {};
          brels.replace(/<Relationship\b([^>]*)\/?>/g, function (_, attrs) {
            var id = /Id="([^"]+)"/.exec(attrs);
            var tgt = /Target="([^"]+)"/.exec(attrs);
            if (id && tgt) brid[id[1]] = tgt[1];
            return '';
          });
          var first = /<sheet\b([^>]*)\/?>/.exec(bwb);
          if (first) {
            var ridM = /r:id="([^"]+)"/.exec(first[1]);
            var sp = normalizeSheetPath(brid[ridM[1]]);
            var sxml = await bzip.file(sp).async('string');
            // merge bespoke styles into ours would be ideal; for now append sheet as-is
            // with style remap from its own styles if present
            var bstyles = bzip.file('xl/styles.xml');
            if (bstyles) {
              var bx = await bstyles.async('string');
              var mg = mergeStylesXml(stylesXml, bx);
              stylesXml = mg.xml;
              sxml = remapSheetStyles(sxml, mg.offsetB.xfs);
            }
            var idxb = sheetEntries.length + 1;
            // photos from bespoke
            var sn = /sheet(\d+)/i.exec(sp);
            var relsP = sn ? 'xl/worksheets/_rels/sheet' + sn[1] + '.xml.rels' : null;
            var hasD = false;
            if (relsP && bzip.file(relsP)) {
              var rxml = await bzip.file(relsP).async('string');
              var dt = null;
              rxml.replace(/<Relationship\b([^>]*)\/?>/g, function (_, a) {
                var typ = /Type="([^"]+)"/.exec(a);
                var tgt = /Target="([^"]+)"/.exec(a);
                if (tgt && (/drawing/i.test((typ && typ[1]) || '') || /drawings\//i.test(tgt[1]))) {
                  dt = 'xl/drawings/' + basename(tgt[1]);
                }
                return '';
              });
              if (dt && bzip.file(dt)) {
                drawingCount++;
                var dName = 'drawing' + drawingCount + '.xml';
                var dXml = await bzip.file(dt).async('string');
                var drelsp = 'xl/drawings/_rels/' + basename(dt) + '.rels';
                var newRels = [];
                if (bzip.file(drelsp)) {
                  var drels = await bzip.file(drelsp).async('string');
                  var embeds = [];
                  drels.replace(/<Relationship\b([^>]*)\/?>/g, function (_, a) {
                    var tgt = /Target="([^"]+)"/.exec(a);
                    var rid = /Id="([^"]+)"/.exec(a);
                    if (tgt) embeds.push({ rid: rid[1], target: tgt[1] });
                    return '';
                  });
                  for (var ej = 0; ej < embeds.length; ej++) {
                    var mp = 'xl/media/' + basename(embeds[ej].target);
                    if (!bzip.file(mp)) continue;
                    mediaCount++;
                    var ext = basename(mp).split('.').pop();
                    var mediaName = 'image' + mediaCount + '.' + ext;
                    out.file('xl/media/' + mediaName, await bzip.file(mp).async('uint8array'));
                    newRels.push(
                      '<Relationship Id="rId' +
                        (ej + 1) +
                        '" Type="' +
                        NS_OD +
                        '/image" Target="../media/' +
                        mediaName +
                        '"/>'
                    );
                  }
                }
                out.file('xl/drawings/' + dName, dXml);
                out.file(
                  'xl/drawings/_rels/' + dName + '.rels',
                  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="' +
                    NS_REL +
                    '">' +
                    newRels.join('') +
                    '</Relationships>'
                );
                out.file(
                  'xl/worksheets/_rels/sheet' + idxb + '.xml.rels',
                  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="' +
                    NS_REL +
                    '"><Relationship Id="rId1" Type="' +
                    NS_OD +
                    '/drawing" Target="../drawings/' +
                    dName +
                    '"/></Relationships>'
                );
                if (!/<drawing\b/.test(sxml)) sxml = sxml.replace(/<\/worksheet>/, '<drawing r:id="rId1"/></worksheet>');
                else sxml = sxml.replace(/<drawing\b[^>]*\/>/, '<drawing r:id="rId1"/>');
                hasD = true;
                report.photos++;
              }
            }
            out.file('xl/worksheets/sheet' + idxb + '.xml', sxml);
            sheetEntries.push({ name: btab, path: 'xl/worksheets/sheet' + idxb + '.xml', hasDrawing: hasD, master: '(bespoke)', source: 'bespoke' });
            report.tabs.push({ tab: btab, master: '(bespoke)', source: 'bespoke', photo: hasD });
          }
        } catch (e) {
          report.errors.push({ tab: btab, error: String(e && e.message || e) });
        }
      }
    }

    if (!sheetEntries.length) throw new Error('OOXML build produced no sheets');

    // Package parts
    out.file('xl/styles.xml', stylesXml);
    out.file('xl/sharedStrings.xml', buildSst(sstItems));
    if (themeXml) out.file('xl/theme/theme1.xml', themeXml);

    var sheetXmlParts = sheetEntries
      .map(function (s, i) {
        return (
          '<sheet name="' +
          xmlEscape(s.name).slice(0, 31) +
          '" sheetId="' +
          (i + 1) +
          '" r:id="rId' +
          (i + 1) +
          '"/>'
        );
      })
      .join('');
    var wbXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      sheetXmlParts +
      '</sheets>' +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
      '</workbook>';
    out.file('xl/workbook.xml', wbXml);

    var relParts = sheetEntries
      .map(function (s, i) {
        return (
          '<Relationship Id="rId' +
          (i + 1) +
          '" Type="' +
          NS_OD +
          '/worksheet" Target="worksheets/sheet' +
          (i + 1) +
          '.xml"/>'
        );
      })
      .concat([
        '<Relationship Id="rId' +
          (sheetEntries.length + 1) +
          '" Type="' +
          NS_OD +
          '/styles" Target="styles.xml"/>',
        '<Relationship Id="rId' +
          (sheetEntries.length + 2) +
          '" Type="' +
          NS_OD +
          '/sharedStrings" Target="sharedStrings.xml"/>',
        themeXml
          ? '<Relationship Id="rId' +
            (sheetEntries.length + 3) +
            '" Type="' +
            NS_OD +
            '/theme" Target="theme/theme1.xml"/>'
          : ''
      ])
      .join('');
    out.file(
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
        '<Relationships xmlns="' +
        NS_REL +
        '">' +
        relParts +
        '</Relationships>'
    );

    out.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
        '<Relationships xmlns="' +
        NS_REL +
        '">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>'
    );

    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    out.file(
      'docProps/core.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:creator>Prepline</dc:creator><cp:lastModifiedBy>Prepline</cp:lastModifiedBy>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' +
        now +
        '</dcterms:created>' +
        '<dcterms:modified xsi:type="dcterms:W3CDTF">' +
        now +
        '</dcterms:modified></cp:coreProperties>'
    );
    out.file(
      'docProps/app.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<Application>Prepline</Application><SheetNames><vt:vector size="' +
        sheetEntries.length +
        '" baseType="lpstr">' +
        sheetEntries.map(function (s) { return '<vt:lpstr>' + xmlEscape(s.name) + '</vt:lpstr>'; }).join('') +
        '</vt:vector></SheetNames></Properties>'
    );

    var overrides = [
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    ];
    if (themeXml) {
      overrides.push(
        '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
      );
    }
    sheetEntries.forEach(function (s, i) {
      overrides.push('<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="' + CT_SHEET + '"/>');
    });
    for (var d = 1; d <= drawingCount; d++) {
      overrides.push('<Override PartName="/xl/drawings/drawing' + d + '.xml" ContentType="' + CT_DRAWING + '"/>');
    }
    var defaults = [
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Default Extension="png" ContentType="image/png"/>',
      '<Default Extension="jpeg" ContentType="image/jpeg"/>',
      '<Default Extension="jpg" ContentType="image/jpeg"/>',
      '<Default Extension="gif" ContentType="image/gif"/>',
      '<Default Extension="emf" ContentType="image/x-emf"/>',
      '<Default Extension="wmf" ContentType="image/x-wmf"/>'
    ];
    out.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        defaults.join('') +
        overrides.join('') +
        '</Types>'
    );

    var buffer = await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return { buffer: buffer, report: report, sheetEntries: sheetEntries };
  }

  var API = {
    buildFromMatched: buildFromMatched,
    ensureJSZip: ensureJSZip,
    mergeStylesXml: mergeStylesXml,
    patchCell: patchCell,
    insertCellInRow: insertCellInRow,
    remapSheetSst: remapSheetSst,
    updateFormulaCaches: updateFormulaCaches
  };
  root.AllocPrepOoxml = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
