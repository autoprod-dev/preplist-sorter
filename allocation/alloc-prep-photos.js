/* Prepline — inject dish photos into SheetJS-built prep-list xlsx (browser).
 * Ports scripts/inject-prep-photos.py: copies first image from matching master
 * sheet (xl/media + drawings) onto each output tab with Gerard's sample
 * oneCellAnchor geometry; also accepts bespoke xlsxBytes photos.
 */
(function (root) {
  'use strict';

  // Exact geometry from prep-list-example.xlsx drawing1.xml
  var SAMPLE_FROM = { col: 1, colOff: 6343650, row: 11, rowOff: 457200 };
  var SAMPLE_EXT = { cx: 6505575, cy: 4724400 };

  var PAGE_SETUP =
    '<pageSetup paperSize="9" pageOrder="overThenDown" ' +
    'orientation="landscape" cellComments="atEnd"/>';
  var PAGE_MARGINS =
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" ' +
    'header="0" footer="0"/>';
  var PRINT_OPTIONS = '<printOptions horizontalCentered="1" gridLines="1"/>';
  var DRAWING_NSDECL =
    'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  var NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

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

  function drawingPathFromTarget(tgt) {
    var name = basename(tgt);
    return 'xl/drawings/' + name;
  }

  function mediaPathFromTarget(tgt) {
    return 'xl/media/' + basename(tgt);
  }

  /** Parse workbook sheet name -> first media bytes from a master xlsx zip. */
  async function indexMasterZip(JSZip, buf, sourceName) {
    var zip = await JSZip.loadAsync(u8(buf));
    var index = {};
    var wbXml = await zip.file('xl/workbook.xml').async('string');
    var relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    var ridTarget = {};
    relsXml.replace(/<Relationship\b([^>]*)\/?>/g, function (_, attrs) {
      var id = /Id="([^"]+)"/.exec(attrs);
      var tgt = /Target="([^"]+)"/.exec(attrs);
      if (id && tgt) ridTarget[id[1]] = tgt[1];
      return '';
    });
    var sheetRe = /<sheet\b([^>]*)\/?>/g;
    var m;
    while ((m = sheetRe.exec(wbXml))) {
      var attrs = m[1];
      var nameM = /name="([^"]+)"/.exec(attrs);
      var ridM = /r:id="([^"]+)"/.exec(attrs);
      if (!nameM || !ridM) continue;
      var name = nameM[1];
      if (/^BULK\b|PLATED\s*MONTHLY|^CUTAWAY\b/i.test(name)) continue;
      var target = ridTarget[ridM[1]] || '';
      var sheetPath = normalizeSheetPath(target);
      var numM = /sheet(\d+)/i.exec(sheetPath);
      if (!numM) continue;
      var sn = numM[1];
      var relsPath = 'xl/worksheets/_rels/sheet' + sn + '.xml.rels';
      var drawingPath = null;
      var relsFile = zip.file(relsPath);
      if (relsFile) {
        var srels = await relsFile.async('string');
        srels.replace(/<Relationship\b([^>]*)\/?>/g, function (_, a) {
          var typ = /Type="([^"]+)"/.exec(a);
          var tgt = /Target="([^"]+)"/.exec(a);
          var typS = typ ? typ[1] : '';
          var tgtS = tgt ? tgt[1] : '';
          if (/drawing/i.test(typS) || /drawings\//i.test(tgtS)) {
            drawingPath = drawingPathFromTarget(tgtS);
          }
          return '';
        });
      }
      if (!drawingPath || !zip.file(drawingPath)) {
        if (!index[name]) {
          index[name] = { source: sourceName, hasPhoto: false };
        }
        continue;
      }
      var drelsPath = 'xl/drawings/_rels/' + basename(drawingPath) + '.rels';
      var mediaPath = null;
      var drelsFile = zip.file(drelsPath);
      if (drelsFile) {
        var drels = await drelsFile.async('string');
        drels.replace(/<Relationship\b([^>]*)\/?>/g, function (_, a) {
          var typ = /Type="([^"]+)"/.exec(a);
          var tgt = /Target="([^"]+)"/.exec(a);
          var typS = typ ? typ[1] : '';
          var tgtS = tgt ? tgt[1] : '';
          if (/\/image$/i.test(typS) || /media\//i.test(tgtS)) {
            if (!mediaPath) mediaPath = mediaPathFromTarget(tgtS);
          }
          return '';
        });
      }
      if (mediaPath && zip.file(mediaPath)) {
        var mediaBytes = await zip.file(mediaPath).async('uint8array');
        var ext = (basename(mediaPath).split('.').pop() || 'jpg').toLowerCase();
        if (ext === 'jpeg') ext = 'jpg';
        index[name] = {
          source: sourceName,
          hasPhoto: true,
          mediaBytes: mediaBytes,
          mediaExt: ext,
          mediaName: basename(mediaPath)
        };
      } else if (!index[name]) {
        index[name] = { source: sourceName, hasPhoto: false };
      }
    }
    return index;
  }

  /** First image from a single-sheet (or multi) bespoke xlsx buffer. */
  async function extractFirstPhotoFromBuf(JSZip, buf) {
    var zip = await JSZip.loadAsync(u8(buf));
    var mediaFiles = Object.keys(zip.files).filter(function (n) {
      return /^xl\/media\//i.test(n) && !zip.files[n].dir;
    });
    if (!mediaFiles.length) return null;
    // Prefer image referenced by first drawing
    var preferred = null;
    var drawRels = Object.keys(zip.files).filter(function (n) {
      return /xl\/drawings\/_rels\//i.test(n);
    });
    for (var i = 0; i < drawRels.length && !preferred; i++) {
      var txt = await zip.file(drawRels[i]).async('string');
      var mm = /Target="([^"]*media\/[^"]+)"/i.exec(txt);
      if (mm) preferred = mediaPathFromTarget(mm[1]);
    }
    var path = preferred && zip.file(preferred) ? preferred : mediaFiles[0];
    var bytes = await zip.file(path).async('uint8array');
    var ext = (basename(path).split('.').pop() || 'jpg').toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    return { hasPhoto: true, mediaBytes: bytes, mediaExt: ext, mediaName: basename(path) };
  }

  function drawingXml(imageRId, imageFilename, picId) {
    picId = picId || 2;
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<xdr:wsDr ' + DRAWING_NSDECL + '>' +
      '<xdr:oneCellAnchor>' +
      '<xdr:from>' +
      '<xdr:col>' + SAMPLE_FROM.col + '</xdr:col>' +
      '<xdr:colOff>' + SAMPLE_FROM.colOff + '</xdr:colOff>' +
      '<xdr:row>' + SAMPLE_FROM.row + '</xdr:row>' +
      '<xdr:rowOff>' + SAMPLE_FROM.rowOff + '</xdr:rowOff>' +
      '</xdr:from>' +
      '<xdr:ext cx="' + SAMPLE_EXT.cx + '" cy="' + SAMPLE_EXT.cy + '"/>' +
      '<xdr:pic>' +
      '<xdr:nvPicPr>' +
      '<xdr:cNvPr id="' + picId + '" name="' + imageFilename + '" title="Image"/>' +
      '<xdr:cNvPicPr preferRelativeResize="0"/>' +
      '</xdr:nvPicPr>' +
      '<xdr:blipFill>' +
      '<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'r:embed="' + imageRId + '" cstate="print"/>' +
      '<a:stretch><a:fillRect/></a:stretch>' +
      '</xdr:blipFill>' +
      '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr>' +
      '</xdr:pic>' +
      '<xdr:clientData fLocksWithSheet="0"/>' +
      '</xdr:oneCellAnchor>' +
      '</xdr:wsDr>'
    );
  }

  function patchSheetPrintAndDrawing(sheetXml, drawingRid) {
    var text = typeof sheetXml === 'string' ? sheetXml : new TextDecoder('utf-8').decode(sheetXml);

    if (/<sheetPr[\s>]/.test(text)) {
      if (text.indexOf('pageSetUpPr') < 0) {
        text = text.replace(/(<sheetPr[^>]*>)/, '$1<pageSetUpPr fitToPage="1"/>');
      } else {
        text = text.replace(/<pageSetUpPr[^/]*\/>/, '<pageSetUpPr fitToPage="1"/>');
      }
    } else {
      text = text.replace(
        /(<worksheet\b[^>]*>)/,
        '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      );
    }

    var mWs = text.match(/<worksheet\b[^>]*>/);
    if (mWs) {
      var attrs = mWs[0].replace(/\sxmlns:r="[^"]*"/g, '');
      attrs = attrs.replace(
        '<worksheet',
        '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
      );
      text = text.replace(mWs[0], attrs);
    }

    text = text.replace(/<printOptions[^/]*\/>/g, '');
    text = text.replace(/<pageMargins[^/]*\/>/g, '');
    text = text.replace(/<pageSetup[^/]*\/>/g, '');
    var block = PRINT_OPTIONS + PAGE_MARGINS + PAGE_SETUP;
    if (/<drawing\b/.test(text)) {
      text = text.replace(/(<drawing\b)/, block + '$1');
    } else {
      text = text.replace('</worksheet>', block + '</worksheet>');
    }

    if (drawingRid) {
      var drawingEl = '<drawing r:id="' + drawingRid + '"/>';
      if (/<drawing\b/.test(text)) {
        text = text.replace(/<drawing[^/]*\/>/, drawingEl);
      } else {
        text = text.replace('</worksheet>', drawingEl + '</worksheet>');
      }
    }
    return text;
  }

  function ensureContentTypes(ctXml, drawingPaths) {
    var text = typeof ctXml === 'string' ? ctXml : new TextDecoder('utf-8').decode(ctXml);
    var defaults = {
      rels: 'application/vnd.openxmlformats-package.relationships+xml',
      xml: 'application/xml',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png'
    };
    Object.keys(defaults).forEach(function (ext) {
      var re = new RegExp('Extension="' + ext + '"', 'i');
      if (!re.test(text)) {
        text = text.replace(
          '</Types>',
          '<Default Extension="' + ext + '" ContentType="' + defaults[ext] + '"/></Types>'
        );
      }
    });
    drawingPaths.forEach(function (dp) {
      var part = '/' + dp;
      if (text.indexOf(part) < 0) {
        text = text.replace(
          '</Types>',
          '<Override PartName="' + part + '" ' +
            'ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'
        );
      }
    });
    return text;
  }

  function aliasFallbacks(masterName) {
    var out = [];
    var AL = (root.AllocPrepList && root.AllocPrepList.ALIASES) || [];
    for (var i = 0; i < AL.length; i++) {
      var a = AL[i];
      var sheets = [a.sheet].concat(a.altSheets || []).filter(Boolean);
      if (sheets.indexOf(masterName) >= 0) {
        sheets.forEach(function (s) {
          if (s !== masterName && out.indexOf(s) < 0) out.push(s);
        });
      }
    }
    return out;
  }

  /**
   * @param {ArrayBuffer|Uint8Array} prepBuf - SheetJS-written prep xlsx
   * @param {object} opts
   *   masters: [{name, buf}] raw master xlsx buffers
   *   matched: [{tab, master, photoFallbacks?, photoMaster?, xlsxBytes?, photoBytes?, photoExt?}]
   *   bespoke: same shape optional extras
   * @returns {Promise<{buffer:Uint8Array, report:object}>}
   */
  async function injectPrepPhotos(prepBuf, opts) {
    opts = opts || {};
    var JSZip = await ensureJSZip();
    var index = {};
    var masters = opts.masters || [];
    for (var mi = 0; mi < masters.length; mi++) {
      var m = masters[mi];
      var mb = u8(m.buf || m.buffer || m.bytes);
      if (!mb) continue;
      var part = await indexMasterZip(JSZip, mb, m.name || ('master' + mi));
      Object.keys(part).forEach(function (k) {
        // Prefer entry that already has a photo
        if (!index[k] || (!index[k].hasPhoto && part[k].hasPhoto)) index[k] = part[k];
      });
    }

    var mapping = (opts.matched || []).concat(opts.bespoke || []);
    var tabToMaster = {};
    var tabFallbacks = {};
    var tabDirectPhoto = {}; // tab -> {mediaBytes, mediaExt}
    mapping.forEach(function (row) {
      if (!row || !row.tab) return;
      var tab = row.tab;
      if (row.master && row.master !== '(bespoke)' && row.master !== '(bespoke-editor)') {
        tabToMaster[tab] = row.photoMaster || row.master;
        var fbs = [];
        if (row.photoMaster && row.photoMaster !== row.master) fbs.push(row.master);
        (row.photoFallbacks || row.altSheets || []).forEach(function (fb) {
          if (fb && fbs.indexOf(fb) < 0 && fb !== tabToMaster[tab]) fbs.push(fb);
        });
        aliasFallbacks(row.master).forEach(function (fb) {
          if (fb && fbs.indexOf(fb) < 0 && fb !== tabToMaster[tab]) fbs.push(fb);
        });
        if (row.master && fbs.indexOf(row.master) < 0) fbs.push(row.master);
        tabFallbacks[tab] = fbs;
      }
      if (row.photoBytes) {
        var ext = (row.photoExt || 'jpg').toLowerCase();
        if (ext === 'jpeg') ext = 'jpg';
        tabDirectPhoto[tab] = {
          hasPhoto: true,
          mediaBytes: u8(row.photoBytes),
          mediaExt: ext
        };
      }
    });

    // Resolve bespoke xlsxBytes into direct photos
    for (var bi = 0; bi < mapping.length; bi++) {
      var rowB = mapping[bi];
      if (!rowB || !rowB.tab || tabDirectPhoto[rowB.tab]) continue;
      var xb = u8(rowB.xlsxBytes || rowB.photoXlsx);
      if (!xb) continue;
      try {
        var ph = await extractFirstPhotoFromBuf(JSZip, xb);
        if (ph && ph.hasPhoto) tabDirectPhoto[rowB.tab] = ph;
      } catch (e) {
        console.warn('bespoke photo extract failed', rowB.tab, e);
      }
    }

    var zip = await JSZip.loadAsync(u8(prepBuf));
    var wbXml = await zip.file('xl/workbook.xml').async('string');
    var relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    var ridTarget = {};
    relsXml.replace(/<Relationship\b([^>]*)\/?>/g, function (_, attrs) {
      var id = /Id="([^"]+)"/.exec(attrs);
      var tgt = /Target="([^"]+)"/.exec(attrs);
      if (id && tgt) ridTarget[id[1]] = tgt[1];
      return '';
    });
    var sheetFiles = {}; // name -> {path, num}
    wbXml.replace(/<sheet\b([^>]*)\/?>/g, function (_, attrs) {
      var nameM = /name="([^"]+)"/.exec(attrs);
      var ridM = /r:id="([^"]+)"/.exec(attrs);
      if (!nameM || !ridM) return '';
      var target = ridTarget[ridM[1]] || '';
      var sp = normalizeSheetPath(target);
      var numM = /sheet(\d+)/i.exec(sp);
      if (!numM) return '';
      sheetFiles[nameM[1]] = { path: sp, num: numM[1] };
      return '';
    });

    var report = { tabs: [], photos: 0, missingPhoto: [], printPatched: 0 };
    var drawingPaths = [];
    var imgSeq = 1;
    var tabNames = Object.keys(sheetFiles);

    for (var ti = 0; ti < tabNames.length; ti++) {
      var tabName = tabNames[ti];
      var sf = sheetFiles[tabName];
      var entry = tabDirectPhoto[tabName] || null;
      var masterName = tabToMaster[tabName] || null;
      if (!entry) {
        if (masterName && index[masterName] && index[masterName].hasPhoto) {
          entry = index[masterName];
        } else {
          var fbl = tabFallbacks[tabName] || (masterName ? aliasFallbacks(masterName) : []);
          for (var fi = 0; fi < fbl.length; fi++) {
            var cand = index[fbl[fi]];
            if (cand && cand.hasPhoto) {
              entry = cand;
              masterName = fbl[fi];
              break;
            }
          }
        }
      }

      var drawingRid = null;
      var photoOk = false;
      if (entry && entry.hasPhoto && entry.mediaBytes) {
        var ext2 = entry.mediaExt || 'jpg';
        if (ext2 === 'jpeg') ext2 = 'jpg';
        var mediaFilename = 'prep_image' + imgSeq + '.' + ext2;
        imgSeq++;
        zip.file('xl/media/' + mediaFilename, entry.mediaBytes);

        var drawingName = 'drawing' + sf.num + '.xml';
        var drawingRelName = drawingName + '.rels';
        var drawingPath = 'xl/drawings/' + drawingName;
        drawingPaths.push(drawingPath);

        zip.file(drawingPath, drawingXml('rId1', mediaFilename, 2));
        zip.file(
          'xl/drawings/_rels/' + drawingRelName,
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<Relationships xmlns="' + NS_REL + '">' +
            '<Relationship Id="rId1" ' +
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ' +
            'Target="../media/' + mediaFilename + '"/>' +
            '</Relationships>'
        );
        zip.file(
          'xl/worksheets/_rels/sheet' + sf.num + '.xml.rels',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<Relationships xmlns="' + NS_REL + '">' +
            '<Relationship Id="rId1" ' +
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" ' +
            'Target="../drawings/' + drawingName + '"/>' +
            '</Relationships>'
        );
        drawingRid = 'rId1';
        photoOk = true;
        report.photos++;
      } else {
        report.missingPhoto.push({ tab: tabName, master: masterName });
      }

      var sheetFile = zip.file(sf.path);
      if (sheetFile) {
        var raw = await sheetFile.async('string');
        zip.file(sf.path, patchSheetPrintAndDrawing(raw, drawingRid));
        report.printPatched++;
      }
      report.tabs.push({
        tab: tabName,
        master: masterName,
        photo: photoOk,
        anchor: photoOk ? SAMPLE_FROM : null,
        ext: photoOk ? SAMPLE_EXT : null
      });
    }

    var ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      var ct = await ctFile.async('string');
      zip.file('[Content_Types].xml', ensureContentTypes(ct, drawingPaths));
    }

    var outBuf = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    return { buffer: outBuf, report: report };
  }

  root.AllocPrepPhotos = {
    injectPrepPhotos: injectPrepPhotos,
    ensureJSZip: ensureJSZip,
    SAMPLE_FROM: SAMPLE_FROM,
    SAMPLE_EXT: SAMPLE_EXT
  };
})(typeof window !== 'undefined' ? window : this);
