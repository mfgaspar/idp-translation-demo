from __future__ import annotations

import uuid
from dataclasses import dataclass

import fitz
import pytesseract
from PIL import Image


@dataclass
class ExtractedSegment:
    segment_id: str
    page_number: int
    bbox: tuple[float, float, float, float]
    extracted_text: str


def extract_segments(file_path: str) -> list[ExtractedSegment]:
    segments: list[ExtractedSegment] = []
    doc = fitz.open(file_path)
    try:
        for page_index in range(len(doc)):
            page = doc.load_page(page_index)
            page_number = page_index + 1
            text = page.get_text("text").strip()
            rect = page.rect
            full_bbox = (0.0, 0.0, float(rect.width), float(rect.height))
            if text:
                segments.append(
                    ExtractedSegment(
                        segment_id=str(uuid.uuid4()),
                        page_number=page_number,
                        bbox=full_bbox,
                        extracted_text=text,
                    )
                )
                continue

            pix = page.get_pixmap(dpi=200)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            ocr_text = pytesseract.image_to_string(img).strip()
            if ocr_text:
                segments.append(
                    ExtractedSegment(
                        segment_id=str(uuid.uuid4()),
                        page_number=page_number,
                        bbox=full_bbox,
                        extracted_text=ocr_text,
                    )
                )
    finally:
        doc.close()

    if not segments:
        raise ValueError("no text extracted")
    return segments
