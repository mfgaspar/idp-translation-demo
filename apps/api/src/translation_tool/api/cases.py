from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from translation_tool.api.deps import get_current_actor, get_db, get_settings
from translation_tool.api.schemas import (
    CaseCreate,
    CaseListItem,
    CaseOut,
    ProcessBody,
    ReviewBody,
    ReviewBulkBody,
    ViewerOut,
    ViewerSegment,
)
from translation_tool.config import Settings
from translation_tool.models.orm import AuditEvent, Case, Document, Segment
from translation_tool.services.audit import record_event
from translation_tool.services.ingestion import ingest_bytes
from translation_tool.services.extraction import OcrUnavailableError
from translation_tool.services.orchestrator import process_document
from translation_tool.services.policy import evidence_export_allowed
from translation_tool.services.translation_provider import TranslationUpstreamError, get_translation_provider
from translation_tool.translation_languages_config import parse_translation_languages_json, validate_process_languages

router = APIRouter()


@router.post("/", response_model=CaseOut, status_code=201)
def create_case(
    body: CaseCreate,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _actor: str = Depends(get_current_actor),
):
    c = Case(external_ref=body.external_ref, status="draft")
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="external_ref already exists") from None
    db.refresh(c)
    record_event(db, case_id=c.id, actor=_actor, action="ingest", details={"step": "case_created"})
    return c


@router.get("/", response_model=list[CaseListItem])
def list_cases(
    db: Session = Depends(get_db),
    _actor: str = Depends(get_current_actor),
    limit: int = 200,
):
    cap = max(1, min(limit, 500))
    stmt = (
        select(Case)
        .options(selectinload(Case.documents), selectinload(Case.segments))
        .order_by(Case.id.desc())
        .limit(cap)
    )
    rows = db.scalars(stmt).all()
    out: list[CaseListItem] = []
    for c in rows:
        docs = sorted(c.documents, key=lambda d: d.id, reverse=True)
        doc = docs[0] if docs else None
        segs = c.segments
        doc_segs = [s for s in segs if doc is not None and s.document_id == doc.id] if doc else []
        if doc_segs:
            avg_conf = sum(s.confidence for s in doc_segs) / len(doc_segs)
            langs = [s.detected_language for s in doc_segs if s.detected_language]
            primary = max(set(langs), key=langs.count) if langs else None
        else:
            avg_conf = None
            primary = None
        n_appr = sum(1 for s in doc_segs if s.status == "approved")
        n_rej = sum(1 for s in doc_segs if s.status == "rejected")
        n_edit = sum(1 for s in doc_segs if s.status == "edited")
        n_pend = sum(1 for s in doc_segs if s.status == "auto")
        review_complete = len(doc_segs) > 0 and n_pend == 0
        out.append(
            CaseListItem(
                id=c.id,
                external_ref=c.external_ref,
                status=c.status,
                content_type=doc.content_type if doc else None,
                original_filename=doc.original_filename if doc else None,
                avg_confidence=avg_conf,
                primary_language=primary,
                source_language=doc.source_language if doc else None,
                target_language=doc.target_language if doc else None,
                created_at=c.created_at,
                review_approved=n_appr,
                review_rejected=n_rej,
                review_edited=n_edit,
                review_pending=n_pend,
                segment_review_complete=review_complete,
            )
        )
    return out


@router.get("/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db), _actor: str = Depends(get_current_actor)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
    return c


def _segment_review_complete_for_loaded_case(c: Case) -> bool:
    """Matches list_cases / dashboard `segment_review_complete` for the latest document."""
    docs = sorted(c.documents, key=lambda d: d.id, reverse=True)
    doc = docs[0] if docs else None
    segs = c.segments
    doc_segs = [s for s in segs if doc is not None and s.document_id == doc.id] if doc else []
    n_pend = sum(1 for s in doc_segs if s.status == "auto")
    return len(doc_segs) > 0 and n_pend == 0


def _loaded_case_or_404(db: Session, case_id: int) -> Case:
    c = db.scalars(select(Case).where(Case.id == case_id).options(selectinload(Case.documents), selectinload(Case.segments))).first()
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
    return c


def _raise_if_archived(c: Case) -> None:
    if _segment_review_complete_for_loaded_case(c):
        raise HTTPException(
            status_code=409,
            detail="case is archived (review complete); this action is not allowed",
        )


@router.delete("/{case_id}", status_code=204)
def delete_case(case_id: int, db: Session = Depends(get_db), _actor: str = Depends(get_current_actor)):
    stmt = select(Case).where(Case.id == case_id).options(selectinload(Case.documents), selectinload(Case.segments))
    c = db.scalars(stmt).first()
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
    if _segment_review_complete_for_loaded_case(c):
        raise HTTPException(
            status_code=409,
            detail="case is archived (segment review complete); delete is not allowed",
        )
    for row in db.scalars(select(Document).where(Document.case_id == case_id)).all():
        path = Path(row.storage_path)
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
    db.execute(delete(Segment).where(Segment.case_id == case_id))
    db.execute(delete(AuditEvent).where(AuditEvent.case_id == case_id))
    db.execute(delete(Document).where(Document.case_id == case_id))
    db.execute(delete(Case).where(Case.id == case_id))
    db.commit()


@router.post("/{case_id}/unarchive", status_code=200)
def unarchive_case(case_id: int, db: Session = Depends(get_db), _actor: str = Depends(get_current_actor)):
    """Return latest-document segments to `auto` so review can continue (dashboard active / not archived)."""
    c = _loaded_case_or_404(db, case_id)
    if not _segment_review_complete_for_loaded_case(c):
        raise HTTPException(status_code=400, detail="case is not archived (segment review not complete)")
    docs = sorted(c.documents, key=lambda d: d.id, reverse=True)
    doc = docs[0] if docs else None
    if doc is None:
        raise HTTPException(status_code=400, detail="no document on case")
    segs = [s for s in c.segments if s.document_id == doc.id]
    if not segs:
        raise HTTPException(status_code=400, detail="no segments on latest document")
    for seg in segs:
        seg.status = "auto"
        db.add(seg)
    db.commit()
    record_event(
        db,
        case_id=case_id,
        actor=_actor,
        action="unarchive",
        details={"document_id": doc.id, "segments_reset": len(segs)},
    )
    return {"ok": True, "segments_reset": len(segs)}


@router.post("/{case_id}/documents", status_code=201)
async def upload_document(
    case_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _actor: str = Depends(get_current_actor),
    file: UploadFile = File(...),
):
    c = _loaded_case_or_404(db, case_id)
    _raise_if_archived(c)
    data = await file.read()
    ct = file.content_type or "application/octet-stream"
    doc = ingest_bytes(
        db,
        settings,
        case_id,
        filename=file.filename or "upload.bin",
        content_type=ct,
        data=data,
    )
    record_event(
        db,
        case_id=case_id,
        actor=_actor,
        action="ingest",
        details={"document_id": doc.id, "sha256": doc.sha256_hex},
    )
    return {"id": doc.id, "content_type": doc.content_type, "original_filename": doc.original_filename}


@router.post("/{case_id}/process", status_code=202)
def run_process(
    case_id: int,
    body: ProcessBody,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _actor: str = Depends(get_current_actor),
):
    c = _loaded_case_or_404(db, case_id)
    _raise_if_archived(c)
    provider = get_translation_provider(settings)
    lang_cfg = parse_translation_languages_json(settings.translation_languages_json)
    try:
        validate_process_languages(lang_cfg, body.source_language, body.target_language)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
    try:
        process_document(
            db,
            settings,
            case_id=case_id,
            document_id=body.document_id,
            provider=provider,
            source_language=body.source_language,
            target_language=body.target_language,
        )
    except OcrUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except TranslationUpstreamError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    row = db.get(Case, case_id)
    if row:
        row.status = "processed"
        db.add(row)
        db.commit()
    return {"status": "processed", "document_id": body.document_id}


@router.get("/{case_id}/viewer", response_model=ViewerOut)
def viewer(case_id: int, db: Session = Depends(get_db), _actor: str = Depends(get_current_actor)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
    doc = db.scalars(select(Document).where(Document.case_id == case_id).order_by(Document.id.desc())).first()
    seg_stmt = select(Segment).where(Segment.case_id == case_id)
    if doc is not None:
        seg_stmt = seg_stmt.where(Segment.document_id == doc.id)
    segs = list(db.scalars(seg_stmt.order_by(Segment.id)).all())
    file_url = None
    doc_id = None
    content_type: str | None = None
    src_lang: str | None = None
    tgt_lang: str | None = None
    resolved_src: str | None = None
    if doc:
        doc_id = doc.id
        content_type = doc.content_type
        file_url = f"/cases/{case_id}/documents/{doc.id}/file"
        src_lang = doc.source_language
        tgt_lang = doc.target_language
        if doc.source_language == "auto" and segs:
            langs = [s.detected_language for s in segs if s.detected_language]
            resolved_src = max(set(langs), key=langs.count) if langs else None
        elif doc.source_language and doc.source_language != "auto":
            resolved_src = doc.source_language
    return ViewerOut(
        case_id=case_id,
        document_id=doc_id,
        original_file_url=file_url,
        content_type=content_type,
        source_language=src_lang,
        target_language=tgt_lang,
        resolved_source_language=resolved_src,
        segments=[
            ViewerSegment(
                segment_id=s.segment_id,
                page_number=s.page_number,
                bbox=[s.bbox_x, s.bbox_y, s.bbox_w, s.bbox_h],
                extracted_text=s.extracted_text,
                translated_text=s.translated_text,
                confidence=s.confidence,
                status=s.status,
            )
            for s in segs
        ],
    )


@router.post("/{case_id}/review", status_code=200)
def review(
    case_id: int,
    body: ReviewBody,
    db: Session = Depends(get_db),
    _actor: str = Depends(get_current_actor),
):
    c = _loaded_case_or_404(db, case_id)
    _raise_if_archived(c)
    seg = db.scalars(select(Segment).where(Segment.case_id == case_id, Segment.segment_id == body.segment_id)).first()
    if seg is None:
        raise HTTPException(status_code=404, detail="segment not found")
    if body.action == "approve":
        seg.status = "approved"
    elif body.action == "reject":
        seg.status = "rejected"
    elif body.action == "edit":
        if body.edited_text is None:
            raise HTTPException(status_code=400, detail="edited_text required for edit")
        seg.translated_text = body.edited_text
        seg.status = "edited"
    else:
        raise HTTPException(status_code=400, detail="invalid action")
    db.add(seg)
    db.commit()
    record_event(db, case_id=case_id, actor=_actor, action=body.action, details={"segment_id": body.segment_id})
    return {"ok": True, "segment_id": body.segment_id, "status": seg.status}


@router.post("/{case_id}/review-bulk", status_code=200)
def review_bulk(
    case_id: int,
    body: ReviewBulkBody,
    db: Session = Depends(get_db),
    _actor: str = Depends(get_current_actor),
):
    c = _loaded_case_or_404(db, case_id)
    _raise_if_archived(c)
    doc = db.scalars(select(Document).where(Document.case_id == case_id).order_by(Document.id.desc())).first()
    if doc is None:
        return {"ok": True, "updated": 0, "document_id": None, "status": None}
    segs = list(
        db.scalars(select(Segment).where(Segment.case_id == case_id, Segment.document_id == doc.id)).all(),
    )
    if body.action == "approve":
        new_status = "approved"
    else:
        new_status = "rejected"
    for seg in segs:
        seg.status = new_status
        db.add(seg)
    db.commit()
    record_event(
        db,
        case_id=case_id,
        actor=_actor,
        action=body.action,
        details={"bulk": True, "document_id": doc.id, "count": len(segs)},
    )
    return {"ok": True, "updated": len(segs), "document_id": doc.id, "status": new_status}


@router.get("/{case_id}/evidence")
def evidence(case_id: int, db: Session = Depends(get_db), settings: Settings = Depends(get_settings), _actor: str = Depends(get_current_actor)):
    if not evidence_export_allowed(settings):
        raise HTTPException(status_code=403, detail="evidence export disabled by policy")
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
    docs = list(db.scalars(select(Document).where(Document.case_id == case_id)).all())
    segs = list(db.scalars(select(Segment).where(Segment.case_id == case_id)).all())
    audits = list(db.scalars(select(AuditEvent).where(AuditEvent.case_id == case_id).order_by(AuditEvent.id)).all())
    docs_sorted = sorted(docs, key=lambda d: d.id, reverse=True)
    latest = docs_sorted[0] if docs_sorted else None
    doc_segs_latest = [s for s in segs if latest is not None and s.document_id == latest.id] if latest else []
    if doc_segs_latest:
        langs = [s.detected_language for s in doc_segs_latest if s.detected_language]
        primary_language = max(set(langs), key=langs.count) if langs else None
    else:
        primary_language = None
    n_pending_latest = sum(1 for s in doc_segs_latest if s.status == "auto")
    segment_review_complete = len(doc_segs_latest) > 0 and n_pending_latest == 0
    n_approved = sum(1 for s in segs if s.status == "approved")
    n_rejected = sum(1 for s in segs if s.status == "rejected")
    n_edited = sum(1 for s in segs if s.status == "edited")
    n_pending = sum(1 for s in segs if s.status == "auto")
    return {
        "case_id": c.id,
        "external_ref": c.external_ref,
        "status": c.status,
        "source_language": latest.source_language if latest else None,
        "target_language": latest.target_language if latest else None,
        "primary_language": primary_language,
        "segment_review_complete": segment_review_complete,
        "latest_document_segment_count": len(doc_segs_latest),
        "segment_counts": {
            "approved": n_approved,
            "rejected": n_rejected,
            "pending": n_pending,
            "edited": n_edited,
        },
        "input_references": [
            {
                "type": d.content_type,
                "filename": d.original_filename,
                "sha256": d.sha256_hex,
                "document_id": d.id,
            }
            for d in docs
        ],
        "segments": [
            {
                "segment_id": s.segment_id,
                "page_number": s.page_number,
                "bbox": [s.bbox_x, s.bbox_y, s.bbox_w, s.bbox_h],
                "extracted_text": s.extracted_text,
                "translated_text": s.translated_text,
                "confidence": s.confidence,
                "status": s.status,
            }
            for s in segs
        ],
        "audit_trail": [
            {"actor": a.actor, "action": a.action, "details": json.loads(a.details_json or "{}")} for a in audits
        ],
    }


@router.get("/{case_id}/documents/{document_id}/file")
def download_file(
    case_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    _actor: str = Depends(get_current_actor),
):
    doc = db.get(Document, document_id)
    if doc is None or doc.case_id != case_id:
        raise HTTPException(status_code=404, detail="document not found")
    path = Path(doc.storage_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="file missing on disk")
    return FileResponse(path, filename=doc.original_filename, media_type=doc.content_type)
