import fitz

from translation_tool.services.extraction import extract_segments


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
