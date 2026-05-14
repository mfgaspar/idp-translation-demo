from __future__ import annotations

import csv
import io
import os
import shutil
import subprocess
import uuid
from collections import defaultdict
from dataclasses import dataclass
from io import StringIO
from pathlib import Path

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


def _bbox_xywh_from_xyxy(x0: float, y0: float, x1: float, y1: float) -> tuple[float, float, float, float]:
    return (float(x0), float(y0), float(x1 - x0), float(y1 - y0))


def _extract_text_dict_line_segments(page: fitz.Page, page_number: int) -> list[ExtractedSegment]:
    """One segment per text line with bbox aligned to the PDF text layer (PyMuPDF user space)."""
    segs: list[ExtractedSegment] = []
    td = page.get_text("dict")
    for block in td.get("blocks", ()):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", ()):
            spans = line.get("spans", ())
            line_text = "".join((s.get("text") or "") for s in spans).strip()
            if not line_text:
                continue
            lb = line.get("bbox")
            if lb and len(lb) >= 4:
                bx0, by0, bx1, by1 = float(lb[0]), float(lb[1]), float(lb[2]), float(lb[3])
            else:
                xs0 = ys0 = float("inf")
                xs1 = ys1 = float("-inf")
                for span in spans:
                    bb = span.get("bbox")
                    if not bb or len(bb) < 4:
                        continue
                    xs0 = min(xs0, float(bb[0]))
                    ys0 = min(ys0, float(bb[1]))
                    xs1 = max(xs1, float(bb[2]))
                    ys1 = max(ys1, float(bb[3]))
                if xs1 <= xs0 or ys1 <= ys0:
                    continue
                bx0, by0, bx1, by1 = xs0, ys0, xs1, ys1
            if bx1 <= bx0 or by1 <= by0:
                continue
            segs.append(
                ExtractedSegment(
                    segment_id=str(uuid.uuid4()),
                    page_number=page_number,
                    bbox=_bbox_xywh_from_xyxy(bx0, by0, bx1, by1),
                    extracted_text=line_text,
                )
            )
    return segs


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


def _run_tesseract_tsv(
    png: bytes,
    *,
    tesseract_cmd: str | None,
    lang: str,
    timeout_sec: float,
) -> str:
    binary = _tesseract_binary(tesseract_cmd)
    cmd = [binary, "stdin", "stdout", "-l", lang, "tsv"]
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


def _ocr_line_segments_from_pixmap(
    page: fitz.Page,
    page_number: int,
    img: Image.Image,
    *,
    tesseract_cmd: str | None,
    tesseract_lang: str,
    timeout_sec: float = 120.0,
) -> list[ExtractedSegment]:
    """OCR lines with bboxes scaled from pixmap pixels to PDF user space (page.rect)."""
    pix_w, pix_h = img.size
    rect = page.rect
    sx = float(rect.width) / max(float(pix_w), 1.0)
    sy = float(rect.height) / max(float(pix_h), 1.0)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    tsv = _run_tesseract_tsv(buf.getvalue(), tesseract_cmd=tesseract_cmd, lang=tesseract_lang, timeout_sec=timeout_sec)

    rows = list(csv.reader(StringIO(tsv), delimiter="\t"))
    if len(rows) < 2:
        return []

    # Rows: level page block par line word left top width height conf text
    by_line: dict[tuple[int, int, int], list[tuple[int, int, int, int, str]]] = defaultdict(list)
    for row in rows[1:]:
        if len(row) < 12:
            continue
        if row[0] != "5":
            continue
        try:
            block = int(row[2])
            par = int(row[3])
            line_num = int(row[4])
            left = int(float(row[6]))
            top = int(float(row[7]))
            w = int(float(row[8]))
            h = int(float(row[9]))
        except ValueError:
            continue
        word = row[11].strip() if len(row) > 11 else ""
        if not word:
            continue
        by_line[(block, par, line_num)].append((left, top, w, h, word))

    segs: list[ExtractedSegment] = []
    for _key, words in sorted(by_line.items(), key=lambda kv: kv[0]):
        left = min(w[0] for w in words)
        top = min(w[1] for w in words)
        right = max(w[0] + w[2] for w in words)
        bottom = max(w[1] + w[3] for w in words)
        line_text = " ".join(w[4] for w in words).strip()
        if not line_text:
            continue
        bx0 = left * sx
        by0 = top * sy
        bw = max((right - left) * sx, 1.0)
        bh = max((bottom - top) * sy, 1.0)
        segs.append(
            ExtractedSegment(
                segment_id=str(uuid.uuid4()),
                page_number=page_number,
                bbox=(bx0, by0, bw, bh),
                extracted_text=line_text,
            )
        )
    return segs


def layout_page_rects(file_path: str) -> list[tuple[int, float, float]]:
    """PyMuPDF page ``rect`` size per page (same coordinate space as segment bboxes).

    Raster images opened with MuPDF are often placed on a standard PDF page whose
    dimensions differ from the image's pixel size; callers must not assume bbox
    coordinates share the same width/height as the raw file's pixels.
    """
    p = Path(file_path)
    if not p.is_file():
        return []
    try:
        doc = fitz.open(p)
    except (RuntimeError, ValueError):
        return []
    try:
        out: list[tuple[int, float, float]] = []
        for i in range(len(doc)):
            page = doc.load_page(i)
            r = page.rect
            out.append((i + 1, float(r.width), float(r.height)))
        return out
    finally:
        doc.close()


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
                line_segs = _extract_text_dict_line_segments(page, page_number)
                if line_segs:
                    segments.extend(line_segs)
                else:
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
            ocr_lines = _ocr_line_segments_from_pixmap(
                page,
                page_number,
                img,
                tesseract_cmd=tesseract_cmd,
                tesseract_lang=ocr_lang,
            )
            if ocr_lines:
                segments.extend(ocr_lines)
            else:
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
