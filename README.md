# Document translation demo

A full-stack demo for **intelligent document processing (IDP)**: upload PDFs or images, run OCR and translation, then review segments side by side with the original document.

| Layer | Stack |
|-------|--------|
| API | Python 3.12, FastAPI, SQLAlchemy, Alembic, PyMuPDF, Tesseract |
| Web | React 19, TypeScript, Vite, Tailwind CSS, react-pdf |
| Data | SQLite (default), file storage under `var/storage` |

## Features

- **Case dashboard** — active and archived cases, search, document type icons, translation direction, segment review summary.
- **Workspace** — upload and process documents, PDF/image viewer with translated overlays, per-segment approve / reject / pending, bulk approve, filters by review status.
- **Audit evidence** — case metadata, audit trail, JSON export (when enabled).
- **Shared case selection** — selecting a case on the dashboard carries through to workspace and audit.

## Repository layout

```
apps/api/          FastAPI backend (translation_tool package)
apps/web/          React frontend
scripts/           Helper scripts (OCR system deps)
docker-compose.yml Local API + web (nginx) deployment
.env.example       Environment variable reference
```

## Prerequisites

### API

- Python **3.12+**
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) and **Poppler** (`pdftoppm`) for PDF/image extraction  
  On Debian/Ubuntu: `./scripts/install-ocr-deps.sh`  
  For Chinese PDFs, install additional tessdata packs (e.g. `tesseract-ocr-chi-sim`).
- Optional: an **OpenAI-compatible** LLM endpoint (Ollama, Azure OpenAI, etc.) when not using the mock provider.

### Web

- Node.js **18.18+**

## Configuration

Copy the template and adjust as needed:

```bash
cp .env.example .env
```

Settings are loaded from `.env` at the repository root or under `apps/api/`. Common variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./dev.db` | SQLAlchemy database URL |
| `STORAGE_ROOT` | `./var/storage` | Uploaded files and artifacts |
| `LLM_PROVIDER` | `mock` | `mock` or `openai_compatible` |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible API base URL |
| `LLM_MODEL` | `gpt-4o-mini` | Model name sent to the provider |
| `LLM_API_KEY` | (empty) | API key when required |
| `ALLOW_EVIDENCE_EXPORT` | `true` | Allow `GET /cases/{id}/evidence` |
| `TESSERACT_CMD` | (PATH) | Full path to `tesseract` if not on PATH |
| `TESSDATA_PREFIX` | — | Directory containing `*.traineddata` |

See `apps/api/src/translation_tool/config.py` for the full list.

## Local development

### 1. API

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Run migrations / create schema on startup via lifespan
uvicorn translation_tool.main:app --reload --host 127.0.0.1 --port 8000
```

API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 2. Web

In a second terminal:

```bash
cd apps/web
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/cases`, `/config`, and `/health` to the API on port 8000.

### Production build (web only)

```bash
cd apps/web
npm run build
npm run preview
```

## Docker Compose

Build and run API + web (web on port **8080** by default):

```bash
docker compose up --build
```

Set `WEB_PORT` to change the host port. API data is stored in the `api-data` volume.

## Tests

```bash
cd apps/api
pip install -e ".[dev]"
PYTHONPATH=src pytest tests/ -v
```

CI runs API tests and validates Compose files on push/PR to `main` / `master`.

## Typical workflow

1. Create or select a **case** on the dashboard.
2. Open **Workspace**, choose source/target languages, upload a PDF or image, and click **Upload & process**.
3. Review segments in the lists and document viewer; approve or reject each segment (or use **Approve all**).
4. When every segment is decided, the case moves to **archived**; use **Unarchive** to continue review.
5. Open **Audit evidence** for case metadata, segment counts, and exportable audit JSON.

## License

See component licenses in the repository (e.g. `tessdata/LICENSE` for bundled Tesseract data references).
