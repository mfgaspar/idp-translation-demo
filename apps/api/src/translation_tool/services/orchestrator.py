from __future__ import annotations

from sqlalchemy.orm import Session

from translation_tool.config import Settings
from translation_tool.models.orm import Document as DocModel, Segment
from translation_tool.services.audit import record_event
from translation_tool.services.extraction import extract_segments, resolve_tesseract_lang_param
from translation_tool.translation_languages_config import parse_translation_languages_json
from translation_tool.services.quality import score_segment_confidence
from translation_tool.services.translation_provider import TranslationProvider, TranslationRequest


def process_document(
    db: Session,
    settings: Settings,
    *,
    case_id: int,
    document_id: int,
    provider: TranslationProvider,
    source_language: str,
    target_language: str,
) -> None:
    doc = db.get(DocModel, document_id)
    if doc is None or doc.case_id != case_id:
        raise ValueError("document not found")

    doc.source_language = source_language
    doc.target_language = target_language

    record_event(db, case_id=case_id, actor="system", action="extract", details={"document_id": document_id})

    lang_cfg = parse_translation_languages_json(settings.translation_languages_json)
    ocr_lang = resolve_tesseract_lang_param(
        source_language,
        configured_source_codes=[o.code for o in lang_cfg.sources],
    )
    extracted = extract_segments(
        doc.storage_path,
        tesseract_cmd=settings.tesseract_cmd,
        tesseract_lang=ocr_lang,
    )
    batch = [
        TranslationRequest(
            segment_id=e.segment_id,
            text=e.extracted_text,
            source_language=source_language,
            target_language=target_language,
        )
        for e in extracted
    ]
    results = provider.translate(batch)
    by_id = {r.segment_id: r for r in results}
    persist = settings.storage_mode != "memory_only"

    for e in extracted:
        r = by_id.get(e.segment_id)
        if r is None:
            continue
        conf = score_segment_confidence(e.extracted_text, r.translated_text)
        detected_lang: str | None
        if source_language == "auto":
            detected_lang = r.detected_source_language if r.detected_source_language else None
        else:
            detected_lang = source_language
        seg = Segment(
            case_id=case_id,
            document_id=document_id,
            segment_id=e.segment_id,
            page_number=e.page_number,
            bbox_x=e.bbox[0],
            bbox_y=e.bbox[1],
            bbox_w=e.bbox[2],
            bbox_h=e.bbox[3],
            extracted_text=e.extracted_text if persist else "",
            translated_text=r.translated_text if persist else "",
            detected_language=detected_lang,
            confidence=conf,
            status="auto",
        )
        db.add(seg)

    db.commit()

    record_event(
        db,
        case_id=case_id,
        actor="system",
        action="translate",
        details={
            "model_id": results[0].model_id if results else None,
            "segments": len(results),
            "source_language": source_language,
            "target_language": target_language,
        },
    )
