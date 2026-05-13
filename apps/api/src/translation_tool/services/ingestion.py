from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from translation_tool.config import Settings
from translation_tool.models.orm import Document


def ingest_bytes(
    db: Session,
    settings: Settings,
    case_id: int,
    *,
    filename: str,
    content_type: str,
    data: bytes,
) -> Document:
    if len(data) > settings.max_upload_bytes:
        raise ValueError("payload too large")
    allowed = {
        "application/pdf",
        "image/png",
        "image/jpeg",
    }
    if content_type not in allowed:
        raise ValueError("unsupported content type")

    digest = hashlib.sha256(data).hexdigest()
    root = Path(settings.storage_root)
    case_dir = root / str(case_id)
    case_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(filename).suffix or ".bin"
    rel = case_dir / f"{uuid.uuid4().hex}{ext}"
    rel.write_bytes(data)

    doc = Document(
        case_id=case_id,
        content_type=content_type,
        original_filename=filename,
        sha256_hex=digest,
        storage_path=str(rel.resolve()),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc
