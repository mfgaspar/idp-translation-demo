import shutil
from io import BytesIO

import fitz
import pytest
from PIL import Image, ImageDraw

from translation_tool.services.extraction import (
    OcrUnavailableError,
    extract_segments,
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
