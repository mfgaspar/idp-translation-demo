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

Build and run API + web (web on port **8001** by default, or set `WEB_PORT`):

```bash
# Optional: language packs for OCR (otherwise the image downloads eng + a few others at build time)
git clone --depth 1 https://github.com/tesseract-ocr/tessdata tessdata

# Optional: LLM and other API settings for Compose (copy template, then edit secrets locally)
cp apps/api/.env.dockerfile.example apps/api/.env.dockerfile

docker compose up --build
```

Compose loads **`apps/api/.env.dockerfile`** into the API container via `env_file` (LLM provider, API keys, etc.). Values in `docker-compose.yml` under `environment:` override the same keys — e.g. `DATABASE_URL`, `STORAGE_ROOT`, and Tesseract paths stay container-specific.

The API image installs **Tesseract** and **Poppler**, installs traineddata under `/tessdata` (from `tessdata/*.traineddata` in the build context when present, otherwise downloaded at build time), and sets `TESSERACT_CMD=/usr/bin/tesseract` and `TESSDATA_PREFIX=/tessdata`. By default `.dockerignore` only sends the languages used by this demo (`eng`, `deu`, `fra`, `spa`, `chi_sim`, `chi_tra`); remove those `tessdata/**` exceptions to bake in the full tessdata tree.

API data (SQLite at `/data/app.db` and uploaded files under `/data/storage`) lives in the named volume **`api-data`**.

### Reset database and storage

To wipe cases, documents, and segments and run migrations on a clean DB (e.g. after schema changes or a bad local state):

```bash
docker compose down -v    # -v removes the api-data volume
docker compose up --build
```

Without `-v`, `docker compose down` keeps the volume; only stopping containers.

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
