#!/usr/bin/env python3
"""Inject dish photos + sample print setup into a SheetJS-built prep-list xlsx.

For each output tab, copies the first image from the matching master sheet and
places it with the exact oneCellAnchor geometry from Gerard's sample
(prep-list-example.xlsx). Also forces landscape A4 fit-to-page print setup.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types"
NS_SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

# Exact geometry from prep-list-example.xlsx drawing1.xml
SAMPLE_FROM = dict(col=1, colOff=6343650, row=11, rowOff=457200)
SAMPLE_EXT = dict(cx=6505575, cy=4724400)

PAGE_SETUP = (
    '<pageSetup paperSize="9" pageOrder="overThenDown" '
    'orientation="landscape" cellComments="atEnd"/>'
)
PAGE_MARGINS = (
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" '
    'header="0" footer="0"/>'
)
PRINT_OPTIONS = '<printOptions horizontalCentered="1" gridLines="1"/>'
DRAWING_NSDECL = (
    'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
)


def _qn(ns, tag):
    return f"{{{ns}}}{tag}"


def load_master_index(master_paths):
    """sheet name -> {zip_path, sheet_xml, drawing_xml, media_bytes, media_ext, media_name}"""
    index = {}
    for mp in master_paths:
        zpath = Path(mp)
        with zipfile.ZipFile(zpath) as z:
            wb = ET.fromstring(z.read("xl/workbook.xml"))
            rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
            rid_target = {el.attrib["Id"]: el.attrib["Target"] for el in rels}
            for s in wb.findall(f"{_qn(NS_SS,'sheets')}/{_qn(NS_SS,'sheet')}"):
                name = s.attrib["name"]
                if re.search(r"^BULK\b|PLATED\s*MONTHLY|^CUTAWAY\b", name, re.I):
                    continue
                rid = s.attrib.get(_qn(NS_R, "id"))
                target = rid_target.get(rid, "")
                sheet_path = "xl/" + target.lstrip("/").replace("xl/", "", 1) if target.startswith("/") or not target.startswith("xl/") else target
                if not sheet_path.startswith("xl/"):
                    sheet_path = "xl/" + target.lstrip("/")
                # normalize
                if target.startswith("worksheets/"):
                    sheet_path = "xl/" + target
                m = re.search(r"sheet(\d+)", sheet_path)
                if not m:
                    continue
                sn = m.group(1)
                rels_path = f"xl/worksheets/_rels/sheet{sn}.xml.rels"
                drawing_path = None
                media_path = None
                if rels_path in z.namelist():
                    srels = ET.fromstring(z.read(rels_path))
                    for el in srels:
                        tgt = el.attrib.get("Target", "")
                        typ = el.attrib.get("Type", "")
                        if "drawing" in typ or "drawings/" in tgt:
                            drawing_path = "xl/" + tgt.lstrip("./").replace("../", "")
                            if not drawing_path.startswith("xl/drawings"):
                                # Target like ../drawings/drawing25.xml
                                drawing_path = "xl/drawings/" + Path(tgt).name
                if not drawing_path or drawing_path not in z.namelist():
                    # still index sheet without photo
                    if name not in index:
                        index[name] = {
                            "master": str(zpath),
                            "sheet_path": sheet_path,
                            "has_photo": False,
                        }
                    continue
                drels_path = "xl/drawings/_rels/" + Path(drawing_path).name + ".rels"
                media_bytes = None
                media_ext = None
                media_name = None
                if drels_path in z.namelist():
                    drels = ET.fromstring(z.read(drels_path))
                    for el in drels:
                        tgt = el.attrib.get("Target", "")
                        if "media/" in tgt or el.attrib.get("Type", "").endswith("/image"):
                            media_path = "xl/media/" + Path(tgt).name
                            break
                if media_path and media_path in z.namelist():
                    media_bytes = z.read(media_path)
                    media_ext = Path(media_path).suffix.lstrip(".").lower() or "jpg"
                    media_name = Path(media_path).name
                index[name] = {
                    "master": str(zpath),
                    "sheet_path": sheet_path,
                    "drawing_path": drawing_path,
                    "has_photo": media_bytes is not None,
                    "media_bytes": media_bytes,
                    "media_ext": media_ext,
                    "media_name": media_name,
                }
    return index


def drawing_xml(image_rId: str, image_filename: str, pic_id: int = 2) -> bytes:
    name = image_filename
    xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f"<xdr:wsDr {DRAWING_NSDECL}>"
        "<xdr:oneCellAnchor>"
        "<xdr:from>"
        f"<xdr:col>{SAMPLE_FROM['col']}</xdr:col>"
        f"<xdr:colOff>{SAMPLE_FROM['colOff']}</xdr:colOff>"
        f"<xdr:row>{SAMPLE_FROM['row']}</xdr:row>"
        f"<xdr:rowOff>{SAMPLE_FROM['rowOff']}</xdr:rowOff>"
        "</xdr:from>"
        f"<xdr:ext cx=\"{SAMPLE_EXT['cx']}\" cy=\"{SAMPLE_EXT['cy']}\"/>"
        "<xdr:pic>"
        "<xdr:nvPicPr>"
        f'<xdr:cNvPr id="{pic_id}" name="{name}" title="Image"/>'
        '<xdr:cNvPicPr preferRelativeResize="0"/>'
        "</xdr:nvPicPr>"
        "<xdr:blipFill>"
        f'<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        f'r:embed="{image_rId}" cstate="print"/>'
        "<a:stretch><a:fillRect/></a:stretch>"
        "</xdr:blipFill>"
        "<xdr:spPr><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr>"
        "</xdr:pic>"
        '<xdr:clientData fLocksWithSheet="0"/>'
        "</xdr:oneCellAnchor>"
        "</xdr:wsDr>"
    )
    return xml.encode("utf-8")


def patch_sheet_print_and_drawing(sheet_xml: bytes, drawing_rid: str | None) -> bytes:
    text = sheet_xml.decode("utf-8")

    # Ensure sheetPr / pageSetUpPr fitToPage="1"
    if re.search(r"<sheetPr[\s>]", text):
        if "pageSetUpPr" not in text:
            text = re.sub(
                r"(<sheetPr[^>]*>)",
                r'\1<pageSetUpPr fitToPage="1"/>',
                text,
                count=1,
            )
        else:
            text = re.sub(
                r"<pageSetUpPr[^/]*/>",
                '<pageSetUpPr fitToPage="1"/>',
                text,
            )
    else:
        text = re.sub(
            r"(<worksheet\b[^>]*>)",
            r'\1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
            text,
            count=1,
        )

    # Normalize worksheet opening tag to exactly one xmlns:r
    m_ws = re.search(r"<worksheet\b[^>]*>", text)
    if m_ws:
        attrs = re.sub(r'\sxmlns:r="[^"]*"', "", m_ws.group(0))
        attrs = attrs.replace(
            "<worksheet",
            '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
            1,
        )
        text = text[: m_ws.start()] + attrs + text[m_ws.end() :]

    # Print setup in sample order, just before drawing or </worksheet>
    text = re.sub(r"<printOptions[^/]*/>", "", text)
    text = re.sub(r"<pageMargins[^/]*/>", "", text)
    text = re.sub(r"<pageSetup[^/]*/>", "", text)
    block = PRINT_OPTIONS + PAGE_MARGINS + PAGE_SETUP
    if re.search(r"<drawing\b", text):
        text = re.sub(r"(<drawing\b)", block + r"\1", text, count=1)
    else:
        text = text.replace("</worksheet>", block + "</worksheet>", 1)

    if drawing_rid:
        drawing_el = f'<drawing r:id="{drawing_rid}"/>'
        if re.search(r"<drawing\b", text):
            text = re.sub(r"<drawing[^/]*/>", drawing_el, text, count=1)
        else:
            text = text.replace("</worksheet>", drawing_el + "</worksheet>", 1)

    return text.encode("utf-8")


def ensure_content_types(ct_xml: bytes, drawing_paths, media_exts) -> bytes:
    text = ct_xml.decode("utf-8")
    # Defaults
    defaults = {
        "rels": "application/vnd.openxmlformats-package.relationships+xml",
        "xml": "application/xml",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
    }
    for ext, ctype in defaults.items():
        if not re.search(rf'Extension="{ext}"', text, re.I):
            text = text.replace(
                "</Types>",
                f'<Default Extension="{ext}" ContentType="{ctype}"/></Types>',
                1,
            )
    for dp in drawing_paths:
        part = "/" + dp
        if part not in text:
            text = text.replace(
                "</Types>",
                f'<Override PartName="{part}" '
                f'ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
                1,
            )
    return text.encode("utf-8")


def inject(out_xlsx: Path, masters: list[str], mapping: list[dict], dest: Path) -> dict:
    index = load_master_index(masters)
    tab_to_master = {}
    tab_fallbacks = {}
    for m in mapping:
        if not m.get("tab") or not m.get("master"):
            continue
        tab_to_master[m["tab"]] = m.get("photoMaster") or m["master"]
        fbs = []
        if m.get("photoMaster") and m.get("photoMaster") != m["master"]:
            fbs.append(m["master"])
        for fb in (m.get("photoFallbacks") or m.get("altSheets") or []):
            if fb and fb not in fbs and fb != tab_to_master[m["tab"]]:
                fbs.append(fb)
        # always allow primary master as fallback if photoMaster differs
        if m["master"] not in fbs:
            fbs.append(m["master"])
        tab_fallbacks[m["tab"]] = fbs

    report = {"tabs": [], "photos": 0, "missing_photo": [], "print_patched": 0}

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        with zipfile.ZipFile(out_xlsx) as zin:
            zin.extractall(td)

        # Map sheet name -> sheetN.xml via workbook
        wb = ET.fromstring((td / "xl/workbook.xml").read_bytes())
        rels = ET.fromstring((td / "xl/_rels/workbook.xml.rels").read_bytes())
        rid_target = {el.attrib["Id"]: el.attrib["Target"] for el in rels}
        sheet_files = {}  # name -> (sheet_path relative xl/, num)
        for s in wb.findall(f"{_qn(NS_SS,'sheets')}/{_qn(NS_SS,'sheet')}"):
            name = s.attrib["name"]
            rid = s.attrib.get(_qn(NS_R, "id"))
            target = rid_target[rid]
            if target.startswith("/"):
                sp = target.lstrip("/")
            elif target.startswith("xl/"):
                sp = target
            else:
                sp = "xl/" + target
            num = re.search(r"sheet(\d+)", sp).group(1)
            sheet_files[name] = (sp, num)

        drawing_paths = []
        media_dir = td / "xl" / "media"
        media_dir.mkdir(parents=True, exist_ok=True)
        drawings_dir = td / "xl" / "drawings"
        drawings_dir.mkdir(parents=True, exist_ok=True)
        (drawings_dir / "_rels").mkdir(parents=True, exist_ok=True)

        img_seq = 1
        for tab_name, (sp, num) in sheet_files.items():
            master_name = tab_to_master.get(tab_name)
            entry = index.get(master_name) if master_name else None
            if not (entry and entry.get("has_photo")):
                for fb in tab_fallbacks.get(tab_name, []):
                    cand = index.get(fb)
                    if cand and cand.get("has_photo"):
                        entry = cand
                        master_name = fb
                        break
            sheet_abs = td / sp
            drawing_rid = None
            photo_ok = False

            if entry and entry.get("has_photo"):
                ext = entry["media_ext"] or "jpg"
                if ext == "jpeg":
                    ext = "jpg"
                media_filename = f"prep_image{img_seq}.{ext}"
                img_seq += 1
                (media_dir / media_filename).write_bytes(entry["media_bytes"])

                drawing_name = f"drawing{num}.xml"
                drawing_rel_name = f"drawing{num}.xml.rels"
                drawing_path = f"xl/drawings/{drawing_name}"
                drawing_paths.append(drawing_path)

                (drawings_dir / drawing_name).write_bytes(
                    drawing_xml("rId1", media_filename, pic_id=2)
                )
                rels_xml = (
                    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                    f'<Relationships xmlns="{NS_REL}">'
                    f'<Relationship Id="rId1" '
                    f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
                    f'Target="../media/{media_filename}"/>'
                    f"</Relationships>"
                )
                (drawings_dir / "_rels" / drawing_rel_name).write_text(rels_xml, encoding="utf-8")

                # sheet rels
                rels_dir = td / "xl" / "worksheets" / "_rels"
                rels_dir.mkdir(parents=True, exist_ok=True)
                sheet_rels = rels_dir / f"sheet{num}.xml.rels"
                drawing_rid = "rId1"
                sheet_rels.write_text(
                    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                    f'<Relationships xmlns="{NS_REL}">'
                    f'<Relationship Id="rId1" '
                    f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" '
                    f'Target="../drawings/{drawing_name}"/>'
                    f"</Relationships>",
                    encoding="utf-8",
                )
                photo_ok = True
                report["photos"] += 1
            else:
                report["missing_photo"].append({"tab": tab_name, "master": master_name})

            raw = sheet_abs.read_bytes()
            patched = patch_sheet_print_and_drawing(raw, drawing_rid)
            sheet_abs.write_bytes(patched)
            report["print_patched"] += 1
            report["tabs"].append(
                {
                    "tab": tab_name,
                    "master": master_name,
                    "photo": photo_ok,
                    "anchor": SAMPLE_FROM if photo_ok else None,
                    "ext": SAMPLE_EXT if photo_ok else None,
                }
            )

        # Content_Types
        ct_path = td / "[Content_Types].xml"
        ct_path.write_bytes(
            ensure_content_types(ct_path.read_bytes(), drawing_paths, [])
        )

        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            dest.unlink()
        with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for f in sorted(td.rglob("*")):
                if f.is_file():
                    zout.write(f, f.relative_to(td).as_posix())

    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--mapping", required=True, help="JSON list of {tab, master}")
    ap.add_argument("--master", action="append", required=True)
    args = ap.parse_args()
    mapping = json.loads(Path(args.mapping).read_text())
    if isinstance(mapping, dict) and "matched" in mapping:
        mapping = mapping["matched"]
    report = inject(Path(args.input), args.master, mapping, Path(args.output))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
