from __future__ import annotations

import io
import os
import shutil
import subprocess
import uuid
from dataclasses import dataclass

import fitz
from PIL import Image


class OcrUnavailableError(RuntimeError):
    """Raised when OCR is needed but the Tesseract binary is missing or misconfigured."""


# BCP47 primary subtag / UI code -> Tesseract ``-l`` traineddata id (ISO 639-3 where applicable).
_TESS_LANG_BY_SOURCE: dict[str, str] = {
    "en": "eng",
    "fr": "fra",
    "de": "deu",
    "es": "spa",
    "pt": "por",
    "it": "ita",
    "nl": "nld",
    "pl": "pol",
    "ru": "rus",
    "el": "ell",
    "tr": "tur",
    "hu": "hun",
    "sv": "swe",
    "no": "nor",
    "da": "dan",
    "fi": "fin",
    # Chinese (UI codes → Tesseract traineddata ids; install e.g. tesseract-ocr-chi-sim)
    "zh": "chi_sim",
    "zh-cn": "chi_sim",
    "zh-hans": "chi_sim",
    "zh-sg": "chi_sim",
    "zh-tw": "chi_tra",
    "zh-hant": "chi_tra",
    "zh-hk": "chi_tra",
    "zh-mo": "chi_tra",
}


def _lookup_tess_for_ui_code(code: str) -> str | None:
    """Map a single configured source code (or explicit user choice) to a Tesseract ``-l`` token."""
    c = code.strip().lower()
    if c in _TESS_LANG_BY_SOURCE:
        return _TESS_LANG_BY_SOURCE[c]
    base = c.split("-", 1)[0]
    return _TESS_LANG_BY_SOURCE.get(base)


def resolve_tesseract_lang_param(source_language: str, *, configured_source_codes: list[str]) -> str:
    """Build the Tesseract ``-l`` value from the chosen source language and configured source list.

    For ``auto``, uses a ``+``-joined list of Tesseract langs for all configured sources (except
    ``auto``), in list order, so OCR can pick the best match among installed packs.
    """
    s = (source_language or "en").strip().lower()
    if s == "auto":
        parts: list[str] = []
        seen: set[str] = set()
        for code in configured_source_codes:
            c = code.strip().lower()
            if c == "auto":
                continue
            tess = _lookup_tess_for_ui_code(code)
            if tess and tess not in seen:
                seen.add(tess)
                parts.append(tess)
        return "+".join(parts) if parts else "eng"
    tess = _lookup_tess_for_ui_code(s)
    if tess:
        return tess
    # Allow passing a raw Tesseract id (e.g. ``chi_sim``) when operators extend the map.
    base = s.split("-", 1)[0]
    if len(base) >= 3 and base.replace("_", "").isalnum():
        return base
    return "eng"


@dataclass
class ExtractedSegment:
    segment_id: str
    page_number: int
    bbox: tuple[float, float, float, float]
    extracted_text: str


def _tesseract_binary(explicit: str | None) -> str:
    if explicit:
        return explicit
    found = shutil.which("tesseract")
    return found if found else "tesseract"


def _ocr_image_via_tesseract_stdin(
    image: Image.Image,
    *,
    tesseract_cmd: str | None,
    lang: str = "eng",
    timeout_sec: float = 120.0,
) -> str:
    """Pipe PNG bytes on stdin so snap-confined Tesseract never has to open a host /tmp path."""
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    png = buf.getvalue()
    binary = _tesseract_binary(tesseract_cmd)
    cmd = [binary, "stdin", "stdout", "-l", lang]
    try:
        proc = subprocess.run(
            cmd,
            input=png,
            capture_output=True,
            timeout=timeout_sec,
            check=False,
            env=os.environ,
        )
    except FileNotFoundError as exc:
        raise OcrUnavailableError(
            "Tesseract OCR is not installed or not on PATH (needed for scanned or image-only PDF pages). "
            "Install tesseract-ocr (e.g. `sudo apt install tesseract-ocr tesseract-ocr-eng`) "
            "or set TESSERACT_CMD to the full path of the tesseract binary."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise OcrUnavailableError(f"Tesseract OCR timed out after {timeout_sec}s.") from exc
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace").strip() or proc.stdout.decode(
            "utf-8", errors="replace"
        ).strip()
        raise OcrUnavailableError(
            "Tesseract OCR failed at runtime (missing language data, misconfigured TESSDATA_PREFIX, or snap limits). "
            "Install matching packs (e.g. tesseract-ocr-eng, tesseract-ocr-chi-sim for Simplified Chinese). "
            f"Details: {err!s}"
        )
    return proc.stdout.decode("utf-8", errors="replace")


def extract_segments(
    file_path: str,
    *,
    tesseract_cmd: str | None = None,
    tesseract_lang: str | None = None,
) -> list[ExtractedSegment]:
    segments: list[ExtractedSegment] = []
    ocr_lang = tesseract_lang if tesseract_lang is not None else "eng"
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
            ocr_text = _ocr_image_via_tesseract_stdin(
                img, tesseract_cmd=tesseract_cmd, lang=ocr_lang
            ).strip()
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
