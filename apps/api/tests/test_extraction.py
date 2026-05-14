import shutil
from io import BytesIO

import fitz
import pytest
from PIL import Image, ImageDraw

from translation_tool.services.extraction import (
    OcrUnavailableError,
    extract_segments,
    layout_page_rects,
    resolve_tesseract_lang_param,
)


def test_resolve_tesseract_lang_explicit():
    codes = ["auto", "en", "fr"]
    assert resolve_tesseract_lang_param("es", configured_source_codes=codes) == "spa"
    assert resolve_tesseract_lang_param("en-US", configured_source_codes=codes) == "eng"
    assert resolve_tesseract_lang_param("de", configured_source_codes=codes) == "deu"


def test_resolve_tesseract_lang_auto_uses_configured_sources():
    codes = ["auto", "en", "fr", "de", "es"]
    r = resolve_tesseract_lang_param("auto", configured_source_codes=codes)
    assert r == "eng+fra+deu+spa"


def test_resolve_tesseract_lang_chinese():
    assert resolve_tesseract_lang_param("zh", configured_source_codes=["auto"]) == "chi_sim"
    assert resolve_tesseract_lang_param("zh-cn", configured_source_codes=["auto"]) == "chi_sim"
    assert resolve_tesseract_lang_param("zh-tw", configured_source_codes=["auto"]) == "chi_tra"


def test_resolve_tesseract_lang_auto_includes_chinese_when_configured():
    codes = ["auto", "en", "zh", "fr"]
    r = resolve_tesseract_lang_param("auto", configured_source_codes=codes)
    assert r == "eng+chi_sim+fra"


def test_resolve_tesseract_lang_auto_only_auto_falls_back_eng():
    assert resolve_tesseract_lang_param("auto", configured_source_codes=["auto"]) == "eng"


def test_layout_page_rects_for_png_differs_from_pixel_size(tmp_path):
    """MuPDF wraps standalone PNG/JPEG in a PDF page; bbox space follows ``page.rect``, not pixels."""
    path = tmp_path / "wide.png"
    Image.new("RGB", (793, 1123), (200, 200, 200)).save(path)
    rects = layout_page_rects(str(path))
    assert len(rects) == 1
    pn, rw, rh = rects[0]
    assert pn == 1
    assert abs(rw - 793) > 1 or abs(rh - 1123) > 1


def test_extract_text_layer_pdf(tmp_path):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Hello world")
    pdf_path = tmp_path / "hello.pdf"
    doc.save(pdf_path)
    doc.close()

    segs = extract_segments(str(pdf_path))
    joined = " ".join(s.extracted_text for s in segs)
    assert "Hello" in joined
    assert "world" in joined
    assert all(s.page_number >= 1 for s in segs)
    assert len(segs) >= 1
    d = fitz.open(str(pdf_path))
    pw, ph = float(d[0].rect.width), float(d[0].rect.height)
    d.close()
    for s in segs:
        x, y, w, h = s.bbox
        assert w > 0 and h > 0
        assert 0 <= x <= pw and 0 <= y <= ph
        assert x + w <= pw + 0.5 and y + h <= ph + 0.5


def test_extract_multiple_lines_have_distinct_bboxes(tmp_path):
    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((72, 72), "First row\nSecond row", fontsize=12)
    path = tmp_path / "two_lines.pdf"
    doc.save(path)
    doc.close()

    segs = extract_segments(str(path))
    assert len(segs) >= 2
    tops = sorted(round(s.bbox[1], 2) for s in segs)
    assert tops[1] > tops[0], "expected line boxes at different vertical positions"


@pytest.mark.skipif(not shutil.which("tesseract"), reason="tesseract not on PATH")
def test_extract_image_only_pdf_uses_ocr(tmp_path):
    img = Image.new("RGB", (420, 120), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((24, 40), "OCRSmokeTest", fill="black")
    buf = BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    doc = fitz.open()
    page = doc.new_page()
    page.insert_image(fitz.Rect(0, 0, 420, 120), stream=png_bytes)
    pdf_path = tmp_path / "raster.pdf"
    doc.save(pdf_path)
    doc.close()

    try:
        segs = extract_segments(str(pdf_path))
    except OcrUnavailableError as e:
        pytest.skip(f"tesseract on PATH but OCR unusable on this host: {e}")

    joined = " ".join(s.extracted_text for s in segs).replace("\n", " ")
    compact = "".join(joined.split())
    assert "OCRSmoke" in compact and "Test" in compact
