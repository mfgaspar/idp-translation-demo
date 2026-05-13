from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from translation_tool.api.deps import get_current_actor, get_db, get_settings
from translation_tool.api.schemas import CaseCreate, CaseOut, ProcessBody, ReviewBody, ViewerOut, ViewerSegment
from translation_tool.config import Settings
from translation_tool.models.orm import AuditEvent, Case, Document, Segment
from translation_tool.services.audit import record_event
from translation_tool.services.ingestion import ingest_bytes
from translation_tool.services.orchestrator import process_document
from translation_tool.services.policy import evidence_export_allowed
from translation_tool.services.translation_provider import get_translation_provider

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


@router.get("/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db), _actor: str = Depends(get_current_actor)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
    return c


@router.post("/{case_id}/documents", status_code=201)
async def upload_document(
    case_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _actor: str = Depends(get_current_actor),
    file: UploadFile = File(...),
):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
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
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
    provider = get_translation_provider(settings)
    try:
        process_document(db, settings, case_id=case_id, document_id=body.document_id, provider=provider)
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
    segs = list(db.scalars(select(Segment).where(Segment.case_id == case_id).order_by(Segment.id)).all())
    file_url = None
    doc_id = None
    if doc:
        doc_id = doc.id
        file_url = f"/cases/{case_id}/documents/{doc.id}/file"
    return ViewerOut(
        case_id=case_id,
        document_id=doc_id,
        original_file_url=file_url,
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
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(status_code=404, detail="case not found")
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
    return {
        "case_id": c.id,
        "external_ref": c.external_ref,
        "status": c.status,
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
