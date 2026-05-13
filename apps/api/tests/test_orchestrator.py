from pathlib import Path

import fitz
from sqlalchemy import select

from translation_tool.config import Settings
from translation_tool.models.orm import Case, Segment
from translation_tool.services.ingestion import ingest_bytes
from translation_tool.services.orchestrator import process_document
from translation_tool.services.translation_provider import MockTranslationProvider


def test_process_document_end_to_end(tmp_path, db_session):
    settings = Settings(_env_file=None, storage_root=str(tmp_path / "s"))
    c = Case(external_ref="ORCH-1", status="draft")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    p = Path(tmp_path) / "x.pdf"
    d = fitz.open()
    d.new_page().insert_text((50, 50), "Bonjour")
    d.save(p)
    d.close()
    doc = ingest_bytes(
        db_session,
        settings,
        c.id,
        filename="x.pdf",
        content_type="application/pdf",
        data=p.read_bytes(),
    )
    process_document(db_session, settings, case_id=c.id, document_id=doc.id, provider=MockTranslationProvider())
    segs = list(db_session.scalars(select(Segment).where(Segment.case_id == c.id)).all())
    assert len(segs) >= 1
    assert all(s.translated_text for s in segs)
