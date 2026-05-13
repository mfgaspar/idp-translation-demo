import hashlib
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from translation_tool.config import Settings
from translation_tool.models.orm import Case, Document
from translation_tool.services.ingestion import ingest_bytes


@pytest.fixture
def case_row(db_session: Session) -> Case:
    c = Case(external_ref="C-ING-1", status="draft")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


def test_ingest_writes_file_and_document_row(tmp_path, db_session, case_row):
    settings = Settings(
        _env_file=None,
        storage_root=str(tmp_path / "store"),
        max_upload_bytes=1024,
    )
    data = b"%PDF-1.4 fake for test"
    doc = ingest_bytes(
        db_session,
        settings,
        case_row.id,
        filename="sample.pdf",
        content_type="application/pdf",
        data=data,
    )
    assert doc.id is not None
    p = Path(doc.storage_path)
    assert p.exists()
    assert doc.sha256_hex == hashlib.sha256(data).hexdigest()
    row = db_session.get(Document, doc.id)
    assert row is not None
    assert row.original_filename == "sample.pdf"
