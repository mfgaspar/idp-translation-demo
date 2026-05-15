# LLM Translation Tool (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a container-deployable, cloud-agnostic MVP that ingests PDF/images, extracts and translates text via a pluggable LLM connector, exposes REST APIs aligned to the architecture blueprint, persists case/segment/audit data under configurable storage policies, and provides a three-pane reviewer UI (original + extracted + translated with segment sync and human validation).

**Architecture:** A single deployable **FastAPI** backend (`apps/api`) owns orchestration, persistence (SQLite dev / Postgres-ready), filesystem document store, append-only audit events, and structured logging. **React + Vite + TypeScript** (`apps/web`) implements the reviewer workspace with PDF.js for multi-page PDFs. OCR uses **PyMuPDF** for text-layer PDFs and **Tesseract** (pytesseract) for raster pages and images. Translation goes through a **`TranslationProvider` protocol** with a **mock provider** for CI and an **OpenAI-compatible HTTP provider** for private endpoints. Policy (TTL, whether content persists) is **environment-driven** so operators can match deployment policy restrictions without code changes.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, Uvicorn, pytest, httpx; Node 22, Vite 6, React 19, TypeScript 5, react-pdf; Docker / docker-compose; Tesseract OCR + poppler-utils (PDF rasterization).

**Context:** This repository currently contains only `PRDs - LLM Translation Tool.md` and `Technical Architecture Blueprint - LLM Tool.md`. Execute tasks in a **clean git worktree** (see superpowers:brainstorming / using-git-worktrees) so the main branch stays untouched until review.

---

## File structure (create or modify)

| Path | Responsibility |
|------|----------------|
| `docker-compose.yml` | Runs API + web dev proxy optional; documents OCR/runtime system packages for production images. |
| `Dockerfile.api` | Multi-stage image: installs tesseract, poppler; runs uvicorn. |
| `apps/api/pyproject.toml` | Python deps, pytest config, ruff optional. |
| `apps/api/alembic.ini` | Alembic configuration. |
| `apps/api/alembic/env.py` | Migration env wired to SQLAlchemy metadata. |
| `apps/api/alembic/versions/001_initial_schema.py` | Initial schema: cases, documents, segments, audit_events. |
| `apps/api/src/translation_tool/__init__.py` | Package marker. |
| `apps/api/src/translation_tool/main.py` | FastAPI app factory, router include, lifespan DB init. |
| `apps/api/src/translation_tool/config.py` | Pydantic `Settings` from env: DB URL, storage root, policy flags, LLM provider config. |
| `apps/api/src/translation_tool/db.py` | Engine, session factory, `get_db` dependency. |
| `apps/api/src/translation_tool/models/orm.py` | SQLAlchemy ORM: `Case`, `Document`, `Segment`, `AuditEvent`. |
| `apps/api/src/translation_tool/schemas/case.py` | Pydantic request/response models mirroring PRD JSON shape for API I/O. |
| `apps/api/src/translation_tool/services/policy.py` | Pure functions: allowed persistence, TTL interpretation. |
| `apps/api/src/translation_tool/services/ingestion.py` | Validate MIME/size, hash file, write to controlled store, create `Document` row. |
| `apps/api/src/translation_tool/services/extraction.py` | PDF/image → list of segments with `page_number`, `bbox`, `extracted_text`. |
| `apps/api/src/translation_tool/services/translation_provider.py` | `Protocol` + `MockTranslationProvider` + `OpenAICompatibleProvider`. |
| `apps/api/src/translation_tool/services/quality.py` | Per-segment and document confidence heuristics. |
| `apps/api/src/translation_tool/services/audit.py` | Append `AuditEvent` rows; never update in place. |
| `apps/api/src/translation_tool/services/orchestrator.py` | Pipeline: extract → translate (batch to provider) → quality scores → persist segments; capture errors for API. |
| `apps/api/src/translation_tool/api/deps.py` | DB session, optional auth stub dependency. |
| `apps/api/src/translation_tool/api/routes_cases.py` | `POST /cases`, `GET /cases/{id}`, `POST /cases/{id}/documents`, `POST /cases/{id}/process`. |
| `apps/api/src/translation_tool/api/routes_viewer.py` | `GET /cases/{id}/viewer` JSON bundle for UI. |
| `apps/api/src/translation_tool/api/routes_review.py` | `POST /cases/{id}/review` approve/edit/reject. |
| `apps/api/src/translation_tool/api/routes_evidence.py` | `GET /cases/{id}/evidence` JSON export (policy-gated). |
| `apps/api/src/translation_tool/api/routes_documents.py` | `GET /cases/{id}/documents/{doc_id}/file` stream original bytes (auth + case check). |
| `apps/api/src/translation_tool/observability/logging.py` | `structlog` or stdlib JSON formatter; bind `case_id`. |
| `apps/api/tests/conftest.py` | SQLite in-memory engine, temp dir fixture, `TestClient`. |
| `apps/api/tests/test_policy.py` | Policy unit tests. |
| `apps/api/tests/test_ingestion.py` | Ingestion with fake FS. |
| `apps/api/tests/test_extraction.py` | Extraction on tiny synthetic PDF/image fixtures. |
| `apps/api/tests/test_translation_provider.py` | Mock + httpx-mock OpenAI-compatible. |
| `apps/api/tests/test_orchestrator.py` | End-to-end pipeline with mock provider. |
| `apps/api/tests/test_api_cases.py` | HTTP contract tests for blueprint endpoints. |
| `apps/web/package.json` | React, Vite, react-pdf, typescript. |
| `apps/web/vite.config.ts` | Proxy `/api` → backend. |
| `apps/web/index.html` | SPA shell. |
| `apps/web/src/main.tsx` | React root. |
| `apps/web/src/App.tsx` | Routes: case list, case workspace. |
| `apps/web/src/api/client.ts` | Typed fetch helpers. |
| `apps/web/src/components/CaseWorkspace.tsx` | Three-pane layout + segment selection state. |
| `apps/web/src/components/DocumentViewerPane.tsx` | react-pdf + image fallback. |
| `apps/web/src/components/SegmentColumns.tsx` | Side-by-side lists with highlight sync. |
| `apps/web/src/components/ReviewToolbar.tsx` | Approve / reject / edit actions calling `POST .../review`. |
| `apps/web/src/vite-env.d.ts` | Env types. |
| `.github/workflows/ci.yml` | Lint + pytest + web build (optional if repo uses GitHub). |

---

### Task 1: Repository scaffold and Python package shell

**Files:**
- Create: `docker-compose.yml`
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/src/translation_tool/__init__.py`
- Create: `apps/api/src/translation_tool/main.py`
- Create: `apps/api/tests/test_health.py`
- Test: `apps/api/tests/test_health.py`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from translation_tool.main import app

def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api && python -m venv .venv && source .venv/bin/activate && pip install "fastapi>=0.115" "uvicorn[standard]>=0.30" "httpx>=0.27" "pytest>=8.3"
PYTHONPATH=src pytest tests/test_health.py::test_health_returns_ok -v
```

Expected: `ModuleNotFoundError` or import error / assertion failure until `main.py` defines `/health`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/pyproject.toml`:

```toml
[project]
name = "translation-tool-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.30.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
```

Create `apps/api/src/translation_tool/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="LLM Translation Tool API")

@app.get("/health")
def health():
    return {"status": "ok"}
```

Create empty `apps/api/src/translation_tool/__init__.py`.

Create `docker-compose.yml` at repo root (services filled in Task 16; for Task 1 use a placeholder so the file exists):

```yaml
# Placeholder — full stack defined in Task 16
services: {}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api && source .venv/bin/activate && PYTHONPATH=src pytest tests/test_health.py::test_health_returns_ok -v
```

Expected: `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/pyproject.toml apps/api/src/translation_tool apps/api/tests/test_health.py docker-compose.yml
git commit -m "chore(api): scaffold FastAPI app with health check"
```

---

### Task 2: Configuration and policy engine (pure functions)

**Files:**
- Create: `apps/api/src/translation_tool/config.py`
- Create: `apps/api/src/translation_tool/services/policy.py`
- Create: `apps/api/tests/test_policy.py`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_policy.py`:

```python
from translation_tool.config import Settings
from translation_tool.services.policy import evidence_export_allowed, persist_extracted_text_allowed

def test_default_settings_allow_persist_and_export():
    s = Settings(_env_file=None)  # use defaults only in test
    assert persist_extracted_text_allowed(s) is True
    assert evidence_export_allowed(s) is True

def test_strict_memory_mode_disables_persist_and_export():
    s = Settings(
        _env_file=None,
        storage_mode="memory_only",
        allow_evidence_export=False,
    )
    assert persist_extracted_text_allowed(s) is False
    assert evidence_export_allowed(s) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api && source .venv/bin/activate && pip install "pydantic-settings>=2.6"
PYTHONPATH=src pytest tests/test_policy.py -v
```

Expected: import errors for missing modules.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/translation_tool/services/__init__.py` (empty).

Create `apps/api/src/translation_tool/config.py` (settings only; policy helpers live in `policy.py`):

```python
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(default="sqlite:///./dev.db")
    storage_root: str = Field(default="./var/storage")
    storage_mode: str = Field(
        default="working_store",
        description="working_store | memory_only — controls whether segment text is written to DB",
    )
    allow_evidence_export: bool = Field(default=True)
    max_upload_bytes: int = Field(default=25 * 1024 * 1024)
```

Create `apps/api/src/translation_tool/services/policy.py`:

```python
from translation_tool.config import Settings


def persist_extracted_text_allowed(settings: Settings) -> bool:
    return settings.storage_mode != "memory_only"


def evidence_export_allowed(settings: Settings) -> bool:
    return settings.allow_evidence_export and settings.storage_mode != "memory_only"
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
PYTHONPATH=src pytest tests/test_policy.py -v
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/config.py apps/api/src/translation_tool/services/policy.py apps/api/tests/test_policy.py apps/api/pyproject.toml
git commit -m "feat(api): add settings and storage policy helpers"
```

---

### Task 3: SQLAlchemy ORM and database session

**Files:**
- Create: `apps/api/src/translation_tool/db.py`
- Create: `apps/api/src/translation_tool/models/orm.py`
- Create: `apps/api/tests/conftest.py`
- Create: `apps/api/tests/test_orm_roundtrip.py`
- Modify: `apps/api/pyproject.toml` (add sqlalchemy)

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/conftest.py`:

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from translation_tool.models.orm import Base, Case


@pytest.fixture
def db_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

Create `apps/api/tests/test_orm_roundtrip.py`:

```python
from translation_tool.models.orm import Case


def test_create_case(db_session):
    c = Case(external_ref="CASE-1", status="draft")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    assert c.id is not None
    assert c.external_ref == "CASE-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pip install "sqlalchemy>=2.0"
PYTHONPATH=src pytest tests/test_orm_roundtrip.py -v
```

Expected: import failure for `models.orm`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/translation_tool/models/__init__.py` (empty).

Create `apps/api/src/translation_tool/models/orm.py`:

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    external_ref: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    documents: Mapped[list["Document"]] = relationship(back_populates="case")
    segments: Mapped[list["Segment"]] = relationship(back_populates="case")
    audit_events: Mapped[list["AuditEvent"]] = relationship(back_populates="case")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), index=True)
    content_type: Mapped[str] = mapped_column(String(128))
    original_filename: Mapped[str] = mapped_column(String(512))
    sha256_hex: Mapped[str] = mapped_column(String(64), index=True)
    storage_path: Mapped[str] = mapped_column(String(1024))
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    case: Mapped["Case"] = relationship(back_populates="documents")


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), index=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    segment_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    page_number: Mapped[int] = mapped_column(Integer)
    bbox_x: Mapped[float] = mapped_column()
    bbox_y: Mapped[float] = mapped_column()
    bbox_w: Mapped[float] = mapped_column()
    bbox_h: Mapped[float] = mapped_column()
    extracted_text: Mapped[str] = mapped_column(Text, default="")
    translated_text: Mapped[str] = mapped_column(Text, default="")
    detected_language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    confidence: Mapped[float] = mapped_column(default=0.0)
    status: Mapped[str] = mapped_column(String(32), default="auto")

    case: Mapped["Case"] = relationship(back_populates="segments")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), index=True)
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64), index=True)
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case: Mapped["Case"] = relationship(back_populates="audit_events")
```

Create `apps/api/src/translation_tool/db.py`:

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from translation_tool.config import Settings

_engine = None
_SessionLocal = None


def get_engine(settings: Settings):
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(settings.database_url, future=True)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)
    return _engine


def get_session_factory(settings: Settings):
    get_engine(settings)
    return _SessionLocal


def get_db(settings: Settings) -> Generator[Session, None, None]:
    SessionLocal = get_session_factory(settings)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
PYTHONPATH=src pytest tests/test_orm_roundtrip.py -v
```

Expected: `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/db.py apps/api/src/translation_tool/models apps/api/tests/conftest.py apps/api/tests/test_orm_roundtrip.py apps/api/pyproject.toml
git commit -m "feat(api): add SQLAlchemy models for cases, documents, segments, audit"
```

---

### Task 4: Alembic initial migration

**Files:**
- Create: `apps/api/alembic.ini`
- Create: `apps/api/alembic/env.py`
- Create: `apps/api/alembic/versions/001_initial_schema.py`
- Modify: `apps/api/pyproject.toml` (add alembic)

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_migrations.py`:

```python
import os
import subprocess
import sys
from pathlib import Path


def test_alembic_upgrade_head(tmp_path):
    root = Path(__file__).resolve().parents[1]
    db_path = tmp_path / "m.db"
    db_url = f"sqlite:///{db_path}"
    env = {**os.environ, "DATABASE_URL": db_url}
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=root,
        check=True,
        env=env,
    )
```

Implement `alembic/env.py` to read `DATABASE_URL` from the environment (see Step 3).

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pip install alembic
PYTHONPATH=src pytest tests/test_migrations.py -v
```

Expected: failure until migration exists.

- [ ] **Step 3: Write minimal implementation**

Run locally once:

```bash
cd apps/api && alembic init alembic
```

Then replace `alembic/versions` with autogenerate from ORM **or** hand-write `001_initial_schema.py` creating the four tables to match `orm.py` columns exactly.

Example `alembic/env.py` core:

```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
from translation_tool.models.orm import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = os.environ["DATABASE_URL"]
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        {"sqlalchemy.url": os.environ["DATABASE_URL"]},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
export DATABASE_URL=sqlite:////tmp/alembic_test.db && alembic upgrade head && pytest tests/test_migrations.py -v
```

Expected: `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/alembic apps/api/alembic.ini apps/api/tests/test_migrations.py
git commit -m "chore(api): add Alembic migrations for initial schema"
```

---

### Task 5: Ingestion service

**Files:**
- Create: `apps/api/src/translation_tool/services/ingestion.py`
- Create: `apps/api/tests/test_ingestion.py`

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `ingest_bytes` missing.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/translation_tool/services/ingestion.py`:

```python
from __future__ import annotations

import hashlib
import os
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
PYTHONPATH=src pytest tests/test_ingestion.py -v
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/services/ingestion.py apps/api/tests/test_ingestion.py
git commit -m "feat(api): add document ingestion with hash and storage path"
```

---

### Task 6: Extraction service (PyMuPDF + Tesseract)

**Files:**
- Create: `apps/api/src/translation_tool/services/extraction.py`
- Create: `apps/api/tests/fixtures/README.md` (one line: add tiny real PDF under git or generate in test)
- Create: `apps/api/tests/test_extraction.py`
- Modify: `Dockerfile.api` (install `tesseract-ocr`, `poppler-utils`, `libtesseract-dev` as needed)
- Modify: `apps/api/pyproject.toml` (`pymupdf`, `Pillow`, `pytesseract`)

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

import fitz  # PyMuPDF
import pytest

from translation_tool.services.extraction import extract_segments


def test_extract_text_layer_pdf(tmp_path):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Hello 世界")
    pdf_path = tmp_path / "hello.pdf"
    doc.save(pdf_path)
    doc.close()

    segs = extract_segments(str(pdf_path))
    joined = " ".join(s.extracted_text for s in segs)
    assert "Hello" in joined
    assert "世界" in joined
    assert all(s.page_number >= 1 for s in segs)
    assert len(segs) >= 1
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `extract_segments` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/translation_tool/services/extraction.py`:

```python
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
            if text:
                rect = page.rect
                seg = ExtractedSegment(
                    segment_id=str(uuid.uuid4()),
                    page_number=page_number,
                    bbox=(0.0, 0.0, float(rect.width), float(rect.height)),
                    extracted_text=text,
                )
                segments.append(seg)
                continue

            pix = page.get_pixmap(dpi=200)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            ocr = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            n = len(ocr["text"])
            buf = []
            left, top, w, h = 0.0, 0.0, 0.0, 0.0
            for i in range(n):
                t = (ocr["text"][i] or "").strip()
                if not t:
                    continue
                buf.append(t)
                left = float(ocr["left"][i])
                top = float(ocr["top"][i])
                w = float(ocr["width"][i])
                h = float(ocr["height"][i])
            if buf:
                seg = ExtractedSegment(
                    segment_id=str(uuid.uuid4()),
                    page_number=page_number,
                    bbox=(left, top, w, h),
                    extracted_text=" ".join(buf),
                )
                segments.append(seg)
    finally:
        doc.close()

    if not segments:
        raise ValueError("no text extracted")
    return segments
```

- [ ] **Step 4: Run test to verify it passes**

Install system deps in dev machine or use Docker for pytest. Run:

```bash
pip install pymupdf pillow pytesseract
PYTHONPATH=src pytest tests/test_extraction.py -v
```

Expected: `PASSED` (requires Tesseract binary on PATH).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/services/extraction.py apps/api/tests/test_extraction.py Dockerfile.api
git commit -m "feat(api): extract text from PDFs with OCR fallback"
```

---

### Task 7: Translation provider protocol and mock

**Files:**
- Create: `apps/api/src/translation_tool/services/translation_provider.py`
- Create: `apps/api/tests/test_translation_provider.py`

- [ ] **Step 1: Write the failing test**

```python
from translation_tool.services.translation_provider import MockTranslationProvider, TranslationRequest


def test_mock_translates_prefix():
    p = MockTranslationProvider()
    out = p.translate(
        [
            TranslationRequest(segment_id="s1", text="你好", source_hint="zh"),
        ]
    )
    assert out[0].segment_id == "s1"
    assert out[0].translated_text.startswith("[en]")
    assert out[0].model_id == "mock"
```

- [ ] **Step 2: Run test to verify it fails**

Expected: module missing.

- [ ] **Step 3: Write minimal implementation**

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class TranslationRequest:
    segment_id: str
    text: str
    source_hint: str | None


@dataclass
class TranslationResult:
    segment_id: str
    translated_text: str
    model_id: str
    model_version: str
    prompt_template_id: str


@runtime_checkable
class TranslationProvider(Protocol):
    def translate(self, batch: list[TranslationRequest]) -> list[TranslationResult]: ...


class MockTranslationProvider:
    def translate(self, batch: list[TranslationRequest]) -> list[TranslationResult]:
        return [
            TranslationResult(
                segment_id=item.segment_id,
                translated_text=f"[en] {item.text}",
                model_id="mock",
                model_version="0",
                prompt_template_id="mock-v0",
            )
            for item in batch
        ]
```

Add `OpenAICompatibleProvider` in same file using `httpx` POST to `settings.llm_base_url` with JSON body mirroring OpenAI chat completions; map `choices[0].message.content` back to segments (single-call batched JSON in prompt for multiple segments). Test with `httpx.MockTransport`.

- [ ] **Step 4: Run test to verify it passes**

```bash
pip install httpx
PYTHONPATH=src pytest tests/test_translation_provider.py -v
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/services/translation_provider.py apps/api/tests/test_translation_provider.py
git commit -m "feat(api): add pluggable translation providers with mock"
```

---

### Task 8: Quality service (confidence heuristics)

**Files:**
- Create: `apps/api/src/translation_tool/services/quality.py`
- Create: `apps/api/tests/test_quality.py`

- [ ] **Step 1: Write the failing test**

```python
from translation_tool.services.quality import score_segment_confidence


def test_short_text_lower_confidence():
    assert score_segment_confidence("Hi", "[en] Hi") < score_segment_confidence(
        "This is a longer segment with more tokens.",
        "[en] This is a longer segment with more tokens.",
    )
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

```python
from __future__ import annotations


def score_segment_confidence(source: str, translated: str) -> float:
    s = max(len(source.strip()), 1)
    t = max(len(translated.strip()), 1)
    ratio = min(s, t) / max(s, t)
    length_boost = min(1.0, s / 80.0)
    return round(min(1.0, 0.5 * ratio + 0.5 * length_boost), 3)
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/services/quality.py apps/api/tests/test_quality.py
git commit -m "feat(api): add heuristic confidence scoring for segments"
```

---

### Task 9: Audit service

**Files:**
- Create: `apps/api/src/translation_tool/services/audit.py`
- Create: `apps/api/tests/test_audit.py`

- [ ] **Step 1: Write the failing test**

```python
import json

from translation_tool.models.orm import AuditEvent, Case
from translation_tool.services.audit import record_event


def test_audit_append_only(db_session):
    c = Case(external_ref="AUD-1", status="draft")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    record_event(db_session, case_id=c.id, actor="system", action="ingest", details={"x": 1})
    record_event(db_session, case_id=c.id, actor="system", action="translate", details={"y": 2})
    rows = db_session.query(AuditEvent).filter_by(case_id=c.id).order_by(AuditEvent.id).all()
    assert len(rows) == 2
    assert json.loads(rows[0].details_json)["x"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

```python
from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from translation_tool.models.orm import AuditEvent


def record_event(db: Session, *, case_id: int, actor: str, action: str, details: dict[str, Any]) -> None:
    ev = AuditEvent(case_id=case_id, actor=actor, action=action, details_json=json.dumps(details))
    db.add(ev)
    db.commit()
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/services/audit.py apps/api/tests/test_audit.py
git commit -m "feat(api): append-only audit events"
```

---

### Task 10: Orchestrator pipeline

**Files:**
- Create: `apps/api/src/translation_tool/services/orchestrator.py`
- Create: `apps/api/tests/test_orchestrator.py`

- [ ] **Step 1: Write the failing test**

Use a tiny PDF from Task 6 pattern inside test `tmp_path`. Assert segments persisted with `translated_text` non-empty when policy allows persist.

```python
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
    import fitz

    p = tmp_path / "x.pdf"
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
    segs = db_session.query(Segment).filter_by(case_id=c.id).all()
    assert len(segs) >= 1
    assert all(s.translated_text for s in segs)
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

`process_document` loads `Document`, calls `extract_segments`, builds `TranslationRequest` list, calls the provider, computes confidence via `quality.score_segment_confidence`, inserts `Segment` rows, and appends a `translate` audit event with model metadata. Store processing metadata in `AuditEvent.details_json` (no extra `Case` column required for MVP).

```python
def process_document(db, settings, *, case_id: int, document_id: int, provider: TranslationProvider) -> None:
    from translation_tool.models.orm import Document as DocModel, Segment
    from translation_tool.services.extraction import extract_segments
    from translation_tool.services.translation_provider import TranslationRequest
    from translation_tool.services.quality import score_segment_confidence
    from translation_tool.services.audit import record_event

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
        details={"model_id": results[0].model_id if results else None, "segments": len(results)},
    )
```

Default tests use `working_store` so text persists. In `memory_only`, segment text columns remain empty (layout/ids still in DB); document bytes remain on disk until a separate retention job is added.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/services/orchestrator.py apps/api/tests/test_orchestrator.py
git commit -m "feat(api): orchestrate extraction, translation, and persistence"
```

---

### Task 11: REST API routes (blueprint-aligned)

**Files:**
- Create: `apps/api/src/translation_tool/schemas/case.py`
- Create: `apps/api/src/translation_tool/api/deps.py`
- Create: `apps/api/src/translation_tool/api/routes_cases.py`
- Create: `apps/api/src/translation_tool/api/routes_viewer.py`
- Create: `apps/api/src/translation_tool/api/routes_review.py`
- Create: `apps/api/src/translation_tool/api/routes_evidence.py`
- Create: `apps/api/src/translation_tool/api/routes_documents.py`
- Modify: `apps/api/src/translation_tool/main.py` (include routers, lifespan creates tables)
- Create: `apps/api/tests/test_api_cases.py`

- [ ] **Step 1: Write the failing test**

```python
from fastapi.testclient import TestClient

from translation_tool.main import create_app
from translation_tool.config import Settings


def test_create_case_and_upload_document(tmp_path, monkeypatch):
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'a.db'}",
        storage_root=str(tmp_path / "st"),
    )
    monkeypatch.setenv("DATABASE_URL", settings.database_url)
    app = create_app(settings)
    client = TestClient(app)
    r = client.post("/cases", json={"external_ref": "X-1"})
    assert r.status_code == 201
    cid = r.json()["id"]
    files = {"file": ("a.pdf", b"%PDF-1.4\n", "application/pdf")}
    r2 = client.post(f"/cases/{cid}/documents", files=files)
    assert r2.status_code == 201
```

Refactor `main.py` to export `create_app(settings: Settings | None = None)` that binds settings and overrides `get_settings` dependency.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

Implement:

- `POST /cases` body `{"external_ref": str}` → insert `Case`, return `{"id", "external_ref", "status"}`.
- `POST /cases/{id}/documents` multipart `file` → `ingest_bytes` + `record_event` ingest.
- `POST /cases/{id}/process` body `{"document_id": int}` → call `process_document` with `MockTranslationProvider` in dev or provider from settings.
- `GET /cases/{id}` → summary counts, status, latest processing metadata from audit.
- `GET /cases/{id}/viewer` → JSON: `document_pages` with `page_number` and `render_reference` URL `/cases/{id}/documents/{doc_id}/pages/{n}` **or** single file URL for images; `segments` array with bbox arrays and texts.
- `POST /cases/{id}/review` body `{"segment_id": str, "action": "approve|reject|edit", "edited_text?": str}` → update `Segment.status` and optional `translated_text`, append audit.
- `GET /cases/{id}/evidence` → if `evidence_export_allowed` false return 403; else JSON bundle per PRD §9.

`GET /cases/{id}/documents/{doc_id}/file` returns `FileResponse` with correct media type.

Wire `create_app` lifespan: `Base.metadata.create_all` for SQLite dev.

- [ ] **Step 4: Run test to verify it passes**

Expand tests to cover viewer + review + evidence.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translation_tool/api apps/api/src/translation_tool/schemas apps/api/src/translation_tool/main.py apps/api/tests/test_api_cases.py
git commit -m "feat(api): add case, document, process, viewer, review, evidence routes"
```

---

### Task 12: Structured observability

**Files:**
- Create: `apps/api/src/translation_tool/observability/logging.py`
- Modify: services to call `log.info("agent_action", ...)`

- [ ] **Step 1: Write the failing test**

```python
import json
import logging

from translation_tool.observability.logging import configure_logging


def test_configure_logging_json(caplog):
    configure_logging()
    logging.getLogger("translation_tool").info("agent_action", extra={"case_id": "1", "action": "translate"})
    assert any("agent_action" in r.message for r in caplog.records)
```

Use standard logging formatter that includes extras if `structlog` not desired for MVP; or `pip install structlog` and assert JSON line.

- [ ] **Step 2–5:** Implement `configure_logging`, call in `create_app`, commit.

---

### Task 13: Auth stub (OIDC-ready boundary)

**Files:**
- Create: `apps/api/src/translation_tool/api/auth.py`
- Modify: `routes_*` to depend on `get_current_actor: str = "anonymous"` when `settings.auth_mode == "none"` else validate `Authorization: Bearer` via JWKS (defer full OIDC to separate task if schedule slips; stub must still centralize dependency).

Minimum:

```python
def get_current_actor(settings: Settings, authorization: str | None = Header(default=None)) -> str:
    if settings.auth_mode == "none":
        return "anonymous"
    raise NotImplementedError("OIDC validation not configured")
```

Test: when `auth_mode` is `required` and no header, `401` on `POST /cases`.

---

### Task 14: Web app scaffold (Vite + React)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/tsconfig.json`

- [ ] **Step 1: Write the failing test**

Use `vitest` + `testing-library/react` for smoke:

```tsx
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders workspace title", () => {
  render(<App />);
  expect(screen.getByText(/translation review/i)).toBeInTheDocument();
});
```

- [ ] **Step 2–5:** Run `npm install`, `npm test`, implement minimal `App`, commit.

---

### Task 15: Three-pane reviewer UI wired to API

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/components/CaseWorkspace.tsx`
- Create: `apps/web/src/components/DocumentViewerPane.tsx`
- Create: `apps/web/src/components/SegmentColumns.tsx`
- Create: `apps/web/src/components/ReviewToolbar.tsx`

- [ ] **Step 1: Component test for segment click highlights pair**

Use `@testing-library/user-event` to click segment row and assert CSS class `selected` on both columns.

- [ ] **Step 2–4:** Implement:

`CaseWorkspace` loads `GET /cases/:id/viewer` (via proxy), passes `segments` to `SegmentColumns`, passes signed or same-origin document URL to `DocumentViewerPane` using `react-pdf` `<Document file={url}>` for PDFs.

Low-confidence flag: `confidence < 0.55` shows amber badge per UX‑3.

`ReviewToolbar` calls `POST /cases/:id/review`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add three-pane reviewer workspace with segment sync"
```

---

### Task 16: Container images and compose

**Files:**
- Create: `Dockerfile.api`
- Create: `Dockerfile.web` (nginx static or `node vite preview` for demo)
- Modify: `docker-compose.yml`

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      DATABASE_URL: sqlite:////data/app.db
      STORAGE_ROOT: /data/storage
    volumes:
      - api-data:/data
    ports:
      - "8000:8000"
  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "5173:80"
    depends_on:
      - api
volumes:
  api-data: {}
```

Verify:

```bash
docker compose build && docker compose up -d
curl -s http://localhost:8000/health
```

Expected: `{"status":"ok"}`.

Commit:

```bash
git add Dockerfile.api Dockerfile.web docker-compose.yml
git commit -m "chore: add Dockerfiles and compose stack"
```

---

### Task 17: CI workflow (optional)

**Files:**
- Create: `.github/workflows/ci.yml`

Run `pytest` in API image context and `npm run build` for web on `push`.

---

## Spec coverage (self-review)

| PRD / architecture item | Task(s) |
|-------------------------|---------|
| FR‑1 ingestion formats | Task 5, 11 |
| FR‑2 original viewer + multi-page PDF | Task 15 (`react-pdf`), Task 11 document file route |
| FR‑3 OCR / extraction | Task 6 |
| FR‑4 pluggable LLM / English translation | Task 7, 10 |
| FR‑5 side‑by‑side segment alignment | Task 15 |
| FR‑6 metadata, confidence, errors | Task 8, 11 (audit + API fields), orchestrator error capture |
| FR‑7 human approve/edit/reject | Task 11 review route, Task 15 toolbar |
| FR‑8 audit evidence | Task 9, 11 evidence export |
| FR‑9 logging / monitoring | Task 12 |
| FR‑10 storage controls | Task 2 policy + Task 10 persist branch |
| FR‑11 container / cloud‑agnostic | Task 16, provider abstraction |
| FR‑12 I/O integration points | Task 11 REST surface |
| NFR‑1 SSO/2FA | Task 13 stub + future JWKS |
| NFR‑5 observability | Task 12 |
| Blueprint orchestrator | Task 10 |
| Blueprint QAS | Task 8 |
| UX‑1 three-pane | Task 15 |
| UX‑2 highlight sync | Task 15 |
| UX‑3 confidence triage | Task 15 |
| UX‑4 evidence export | Task 11 |

**Gaps (explicit):** Full OIDC/OAuth2 client flow, mTLS between services, KMS encryption at rest, SIEM connectors, Redis/Celery async queue, automated PII redaction pipeline, and prompt-template artifact store are **not** fully implemented in this MVP plan; they are staged behind Tasks 13 stub, Task 16 single-container SQLite, and future epics. Add a follow-up plan if policy mandates async workers before UI demo.

**Placeholder scan:** No `TBD` steps; open gaps listed above in prose only.

**Type consistency:** `TranslationProvider.translate` always returns `TranslationResult` with `model_id`, `model_version`, `prompt_template_id`; orchestrator audit `translate` event reads those fields.

---

## Plan complete and saved to `docs/superpowers/plans/2026-05-13-llm-translation-tool-mvp.md`

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:** superpowers:subagent-driven-development.

**2. Inline Execution** — Execute tasks in this session using superpowers:executing-plans with batch checkpoints.

**Which approach do you want?**
