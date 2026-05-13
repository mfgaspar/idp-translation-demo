from __future__ import annotations

from sqlalchemy.orm import Session

from translation_tool.config import Settings
from translation_tool.models.orm import Document as DocModel, Segment
from translation_tool.services.audit import record_event
from translation_tool.services.extraction import extract_segments
from translation_tool.services.quality import score_segment_confidence
from translation_tool.services.translation_provider import TranslationProvider, TranslationRequest


def process_document(
    db: Session,
    settings: Settings,
    *,
    case_id: int,
    document_id: int,
    provider: TranslationProvider,
) -> None:
    doc = db.get(DocModel, document_id)
    if doc is None or doc.case_id != case_id:
        raise ValueError("document not found")

    record_event(db, case_id=case_id, actor="system", action="extract", details={"document_id": document_id})

    extracted = extract_segments(doc.storage_path)
    batch = [TranslationRequest(segment_id=e.segment_id, text=e.extracted_text, source_hint=None) for e in extracted]
    results = provider.translate(batch)
    by_id = {r.segment_id: r for r in results}
    persist = settings.storage_mode != "memory_only"

    for e in extracted:
        r = by_id.get(e.segment_id)
        if r is None:
            continue
        conf = score_segment_confidence(e.extracted_text, r.translated_text)
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
        },
    )
