"""Build archival C360 DOCX files from the maintained Markdown (stdlib only)."""

from __future__ import annotations

import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "word"
DATE = "21/09/2026"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

DOCUMENTS = (
    ("00_DANH_MUC_BO_HO_SO_C360", "docs/BO_HO_SO_TAI_LIEU_C360.md", "C360-REG-00", "DANH MỤC BỘ HỒ SƠ TÀI LIỆU C360", "Người lưu trữ và bàn giao hồ sơ"),
    ("01_HUONG_DAN_SU_DUNG_CHI_TIET_C360", "docs/HUONG_DAN_SU_DUNG_CHI_TIET_HE_THONG_C360.md", "C360-USR-01", "HƯỚNG DẪN SỬ DỤNG CHI TIẾT C360", "Cán bộ, lãnh đạo đơn vị và người xem báo cáo"),
    ("02_QUY_TRINH_VAN_HANH_C360", "docs/QUY_TRINH_VAN_HANH_HE_THONG_C360.md", "C360-OPS-01", "QUY TRÌNH VẬN HÀNH HỆ THỐNG C360", "Quản trị hệ thống và vận hành dữ liệu"),
    ("03_QUY_TRINH_SAO_LUU_KHOI_PHUC_C360", "docs/QUY_TRINH_SAO_LUU_KHOI_PHUC_C360.md", "C360-DBA-02", "QUY TRÌNH SAO LƯU VÀ KHÔI PHỤC C360", "Quản trị hệ thống và cơ sở dữ liệu"),
    ("04_DAC_TA_NGUON_DU_LIEU_C360", "docs/DAC_TA_NGUON_DU_LIEU_C360.md", "C360-DATA-03", "ĐẶC TẢ NGUỒN DỮ LIỆU C360", "Chủ nguồn, quản trị dữ liệu và phát triển"),
    ("05_MA_TRAN_PHAN_QUYEN_BAO_MAT_C360", "docs/MA_TRAN_PHAN_QUYEN_VA_BAO_MAT_C360.md", "C360-SEC-05", "MA TRẬN PHÂN QUYỀN VÀ BẢO MẬT C360", "Quản trị quyền và kiểm soát nội bộ"),
    ("06_KIEN_TRUC_HE_THONG_ERD_C360", "docs/KIEN_TRUC_HE_THONG_VA_ERD_C360.md", "C360-ARC-10", "KIẾN TRÚC HỆ THỐNG VÀ ERD C360", "Phát triển và quản trị kỹ thuật"),
    ("07_TRUY_VET_CHI_TIEU_GIAO_DIEN_C360", "docs/TRUY_VET_CHI_TIEU_GIAO_DIEN_C360.md", "C360-LIN-04", "TRUY VẾT CHỈ TIÊU HIỂN THỊ TRÊN GIAO DIỆN C360", "Nghiệp vụ, kiểm soát và phát triển"),
)


def split_row(line: str) -> list[str]:
    return [cell.strip().replace(r"\|", "|") for cell in re.split(r"(?<!\\)\|", line.strip().strip("|"))]


def table_separator(line: str) -> bool:
    cells = split_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def parse_blocks(markdown: str) -> list[dict]:
    lines = markdown.splitlines()
    blocks = []
    i = 0
    skip_title = True
    while i < len(lines):
        value = lines[i].strip()
        if not value:
            i += 1
            continue
        if value.startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            blocks.append({"type": "code", "text": "\n".join(code)})
            i += 1
            continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", value)
        if heading:
            level = len(heading.group(1))
            if level == 1 and skip_title:
                skip_title = False
            else:
                blocks.append({"type": "heading", "level": max(1, min(level - 1, 3)), "text": heading.group(2)})
            i += 1
            continue
        if value.startswith("|") and i + 1 < len(lines) and table_separator(lines[i + 1]):
            header = split_row(lines[i])
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            blocks.append({"type": "table", "header": header, "rows": rows})
            continue
        if value.startswith(">"):
            quoted = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quoted.append(lines[i].strip()[1:].strip())
                i += 1
            blocks.append({"type": "quote", "text": " ".join(quoted)})
            continue
        list_match = re.match(r"^(?:([-*])|(\d+)\.)\s+(.+)$", value)
        if list_match:
            ordered = bool(list_match.group(2))
            number = int(list_match.group(2)) if ordered else 0
            while i < len(lines):
                item = re.match(r"^(?:([-*])|(\d+)\.)\s+(.+)$", lines[i].strip())
                if not item or bool(item.group(2)) != ordered:
                    break
                text = re.sub(r"^\[ \]\s*", "☐ ", item.group(3))
                text = re.sub(r"^\[x\]\s*", "☑ ", text, flags=re.IGNORECASE)
                blocks.append({"type": "list", "text": (f"{number}. " if ordered else "• ") + text})
                number += 1
                i += 1
            continue
        if value in {"---", "***"}:
            i += 1
            continue
        parts = [value]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,6}\s|```|\||>|[-*]\s+|\d+\.\s+)", lines[i].strip()):
            parts.append(lines[i].strip())
            i += 1
        blocks.append({"type": "paragraph", "text": " ".join(parts)})
    return blocks


def run(text: str, *, bold: bool = False, italic: bool = False, code: bool = False, color: str | None = None, size: int | None = None) -> str:
    if not text:
        return ""
    props = []
    if bold:
        props.append("<w:b/>")
    if italic:
        props.append("<w:i/>")
    if code:
        props.append('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>')
        color = color or "8A1538"
        size = size or 18
    if color:
        props.append(f'<w:color w:val="{color}"/>')
    if size:
        props.append(f'<w:sz w:val="{size}"/>')
    rp = "<w:rPr>" + "".join(props) + "</w:rPr>" if props else ""
    return f'<w:r>{rp}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


INLINE = re.compile(r"(`[^`]+`|\*\*.+?\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))")


def rich(text: str) -> str:
    pieces = []
    last = 0
    for match in INLINE.finditer(text):
        pieces.append(run(text[last:match.start()]))
        token = match.group()
        if token.startswith("`"):
            pieces.append(run(token[1:-1], code=True))
        elif token.startswith("**"):
            pieces.append(run(token[2:-2], bold=True))
        elif token.startswith("*"):
            pieces.append(run(token[1:-1], italic=True))
        else:
            label, target = re.match(r"\[([^\]]+)\]\(([^)]+)\)", token).groups()
            name = target if target.startswith(("http://", "https://")) else target.rsplit("/", 1)[-1]
            pieces.append(run(label, color="275A77"))
            pieces.append(run(f" ({name})", color="6D7884", size=17))
        last = match.end()
    pieces.append(run(text[last:]))
    return "".join(pieces)


def paragraph(text: str = "", *, style: str = "Normal", align: str | None = None, before: int = 0, after: int = 120, left: int = 0, keep: bool = False, page_break: bool = False, special_runs: str | None = None) -> str:
    pp = [f'<w:pStyle w:val="{style}"/>', f'<w:spacing w:before="{before}" w:after="{after}"/>']
    if align:
        pp.append(f'<w:jc w:val="{align}"/>')
    if left:
        pp.append(f'<w:ind w:left="{left}"/>')
    if keep:
        pp.append("<w:keepNext/>")
    body = special_runs if special_runs is not None else rich(text)
    if page_break:
        body += '<w:r><w:br w:type="page"/></w:r>'
    return "<w:p><w:pPr>" + "".join(pp) + "</w:pPr>" + body + "</w:p>"


def table(header: list[str], rows: list[list[str]], widths: list[int] | None = None) -> str:
    columns = len(header)
    total = 9440
    widths = widths or [total // columns] * columns
    widths[-1] += total - sum(widths)
    grid = "".join(f'<w:gridCol w:w="{width}"/>' for width in widths)
    borders = "".join(f'<w:{edge} w:val="single" w:sz="5" w:color="D7DEE5"/>' for edge in ("top", "left", "bottom", "right", "insideH", "insideV"))
    result = ['<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/>',
              '<w:tblBorders>' + borders + '</w:tblBorders>',
              '<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="95" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="95" w:type="dxa"/></w:tblCellMar></w:tblPr>',
              '<w:tblGrid>' + grid + '</w:tblGrid>']
    for row_index, row in enumerate([header, *rows]):
        result.append('<w:tr><w:trPr><w:cantSplit/></w:trPr>')
        for col in range(columns):
            value = row[col] if col < len(row) else ""
            shade = '<w:shd w:fill="EDF1F4"/>' if row_index == 0 else ('<w:shd w:fill="F8FAFB"/>' if row_index % 2 == 0 else "")
            result.append(f'<w:tc><w:tcPr><w:tcW w:w="{widths[col]}" w:type="dxa"/>{shade}</w:tcPr>')
            result.append(paragraph(value, style="TableText", after=0, special_runs=run(value, bold=True) if row_index == 0 else rich(value)))
            result.append('</w:tc>')
        result.append('</w:tr>')
    result.append('</w:tbl>')
    return "".join(result)


def cover(title: str, code: str, audience: str) -> str:
    return "".join((
        paragraph("C360  |  QUẢN LÝ KHÁCH HÀNG", style="CoverBrand", align="center", before=2200, after=700),
        paragraph("━━━━━━━━━━━━━━━━━━━━", style="CoverRule", align="center", after=700),
        paragraph(title, style="CoverTitle", align="center", after=400),
        paragraph(f"{code}   •   PHIÊN BẢN 1.0", style="CoverCode", align="center", after=700),
        paragraph(f"Dành cho: {audience}", style="CoverAudience", align="center", after=1800),
        paragraph(f"TÀI LIỆU NỘI BỘ   •   Ngày lập {DATE}", style="CoverNote", align="center"),
        paragraph(page_break=True, after=0),
    ))


def control_page(code: str, audience: str) -> str:
    parts = [paragraph("THÔNG TIN KIỂM SOÁT TÀI LIỆU", style="FrontHeading", keep=True)]
    parts.append(table(["Thông tin", "Giá trị"], [
        ["Mã tài liệu", code], ["Phiên bản", "1.0"], ["Ngày lập", DATE],
        ["Trạng thái", "Bản lập hồ sơ, chờ kiểm tra/phê duyệt"], ["Đối tượng", audience],
        ["Đơn vị quản lý", "Đơn vị quản lý hệ thống C360"],
        ["Phạm vi lưu hành", "Nội bộ; không đính kèm dữ liệu KH, mật khẩu hoặc token"],
    ], widths=[2350, 7090]))
    parts.append(paragraph("Xác nhận tài liệu", style="FrontSubheading", keep=True))
    parts.append(table(["Vai trò", "Họ và tên / Chức danh", "Chữ ký", "Ngày ký"], [
        ["Người lập", "", "", ""], ["Người kiểm tra nghiệp vụ", "", "", ""],
        ["Người phê duyệt", "", "", ""],
    ], widths=[2250, 3650, 1800, 1740]))
    parts.append(paragraph("Lịch sử phiên bản", style="FrontSubheading", keep=True))
    parts.append(table(["Phiên bản", "Ngày lập", "Nội dung thay đổi", "Người thực hiện"], [
        ["1.0", DATE, "Lập tài liệu lần đầu theo giao diện và mã nguồn C360 hiện tại", "Chờ điền"],
    ], widths=[1450, 1800, 4640, 1550]))
    parts.append(paragraph("Lưu ý: Các ô ký xác nhận để trống theo chủ ý. Bản Word chưa phải tài liệu đã phê duyệt cho đến khi đơn vị có thẩm quyền rà soát và ký.", style="Quote", before=260))
    parts.append(paragraph(page_break=True, after=0))
    return "".join(parts)


def toc_page() -> str:
    field_parts = ('<w:fldChar w:fldCharType="begin"/>',
                   '<w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText>',
                   '<w:fldChar w:fldCharType="separate"/>',
                   '<w:t>Mục lục sẽ được cập nhật khi mở bằng Microsoft Word.</w:t>',
                   '<w:fldChar w:fldCharType="end"/>')
    field = "".join(f'<w:r>{part}</w:r>' for part in field_parts)
    return "".join((paragraph("MỤC LỤC", style="FrontHeading", keep=True),
                    paragraph(special_runs=field),
                    paragraph("Nếu Word chưa hiện số trang: nhấn Ctrl+A, F9 rồi lưu lại tài liệu.", style="Quote"),
                    paragraph(page_break=True, after=0)))


def body_blocks(blocks: list[dict]) -> str:
    result = []
    for block in blocks:
        kind = block["type"]
        if kind == "heading":
            level = block["level"]
            result.append(paragraph(block["text"], style=f"Heading{level}", before=280 if level == 1 else 170, after=130, keep=True))
        elif kind == "table":
            result.append(table(block["header"], block["rows"]))
        elif kind == "list":
            result.append(paragraph(block["text"], style="ListText", left=360, after=70))
        elif kind == "quote":
            result.append(paragraph(block["text"], style="Quote", before=120, after=150, left=250))
        elif kind == "code":
            for line in block["text"].split("\n"):
                result.append(paragraph(line or " ", style="Code", after=0, special_runs=run(line or " ", code=True)))
            result.append(paragraph(after=60))
        else:
            result.append(paragraph(block["text"]))
    return "".join(result)


def style(style_id: str, name: str, *, size: int, color: str = "263341", bold: bool = False, before: int = 0, after: int = 120, keep: bool = False, font: str = "Aptos") -> str:
    sp = '<w:keepNext/>' if keep else ''
    bp = '<w:b/>' if bold else ''
    return (f'<w:style w:type="paragraph" w:styleId="{style_id}"><w:name w:val={quoteattr(name)}/>'
            f'<w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="{before}" w:after="{after}"/>{sp}</w:pPr>'
            f'<w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}"/><w:sz w:val="{size}"/><w:color w:val="{color}"/>{bp}</w:rPr></w:style>')


def styles_xml() -> str:
    normal = ('<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'
              '<w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>'
              '<w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="21"/><w:color w:val="263341"/></w:rPr></w:style>')
    variants = [
        style("FrontHeading", "Front Heading", size=32, color="8A1538", bold=True, before=320, after=160, keep=True),
        style("FrontSubheading", "Front Subheading", size=25, color="244C64", bold=True, before=220, after=130, keep=True),
        style("Heading1", "heading 1", size=32, color="8A1538", bold=True, before=320, after=160, keep=True),
        style("Heading2", "heading 2", size=25, color="244C64", bold=True, before=220, after=130, keep=True),
        style("Heading3", "heading 3", size=22, color="244C64", bold=True, before=180, after=100, keep=True),
        style("CoverBrand", "Cover Brand", size=28, color="8A1538", bold=True),
        style("CoverRule", "Cover Rule", size=22, color="A11D42", bold=True),
        style("CoverTitle", "Cover Title", size=52, color="263341", bold=True),
        style("CoverCode", "Cover Code", size=24, color="8A1538", bold=True),
        style("CoverAudience", "Cover Audience", size=23, color="526475"),
        style("CoverNote", "Cover Note", size=19, color="6D7884"),
        style("TableText", "Table Text", size=18, after=0),
        style("ListText", "List Text", size=21, after=70),
        style("Quote", "Note", size=20, color="5F5260", before=120, after=120),
        style("Code", "Code", size=18, color="8A1538", after=0, font="Consolas"),
    ]
    return f'<w:styles xmlns:w="{W}">{normal}{"".join(variants)}</w:styles>'


def document_xml(content: str) -> str:
    section = ('<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/>'
               '<w:footerReference w:type="default" r:id="rIdFooter"/><w:titlePg/>'
               '<w:pgSz w:w="11906" w:h="16838"/>'
               '<w:pgMar w:top="1247" w:right="1162" w:bottom="1191" w:left="1304" '
               'w:header="600" w:footer="600" w:gutter="0"/></w:sectPr>')
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{content}{section}</w:body></w:document>'


def header_xml(code: str) -> str:
    text = f"C360  |  {code}  |  TÀI LIỆU NỘI BỘ"
    body = paragraph(special_runs=run(text, color="6D7884", size=16), after=0)
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="{W}">{body}</w:hdr>'


def footer_xml(code: str) -> str:
    fields = (run(f"{code}  •  Lưu hành nội bộ                                      Trang ", color="6D7884", size=16)
              + '<w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>')
    body = paragraph(special_runs=fields, after=0)
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="{W}">{body}</w:ftr>'


def core_xml(title: str) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            f'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
            f'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{escape(title)}</dc:title><dc:creator>C360</dc:creator>'
            f'<dc:subject>Tài liệu vận hành và sử dụng nội bộ</dc:subject>'
            f'<dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>'
            f'</cp:coreProperties>')


def write_docx(path: Path, code: str, title: str, content: str) -> None:
    types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="xml" ContentType="application/xml"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
             '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
             '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
             '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
             '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
             '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
             '</Types>')
    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                 '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
                 '</Relationships>')
    word_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                 '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
                 '<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
                 '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
                 '</Relationships>')
    parts = {
        "[Content_Types].xml": types,
        "_rels/.rels": root_rels,
        "docProps/core.xml": core_xml(title),
        "word/document.xml": document_xml(content),
        "word/styles.xml": styles_xml(),
        "word/settings.xml": f'<w:settings xmlns:w="{W}"><w:updateFields w:val="true"/></w:settings>',
        "word/_rels/document.xml.rels": word_rels,
        "word/header1.xml": header_xml(code),
        "word/footer1.xml": footer_xml(code),
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, text in parts.items():
            archive.writestr(name, text.encode("utf-8"))


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for stem, source, code, title, audience in DOCUMENTS:
        blocks = parse_blocks((ROOT / source).read_text(encoding="utf-8"))
        content = cover(title, code, audience) + control_page(code, audience) + toc_page() + body_blocks(blocks)
        target = OUTPUT / f"{stem}.docx"
        write_docx(target, code, title, content)
        print(f"Created {target} ({len(blocks)} content blocks)")


if __name__ == "__main__":
    main()
