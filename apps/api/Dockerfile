# OCR runtime: Tesseract + Poppler (for PDF rasterization used by PyMuPDF).
# Build from repository root: docker compose build api
FROM python:3.12-slim-bookworm AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-chi-sim \
        tesseract-ocr-chi-tra \
        tesseract-ocr-fra \
        tesseract-ocr-deu \
        tesseract-ocr-spa \
        poppler-utils \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Debian package installs the binary here; tessdata lives under /tessdata (see install-tessdata.sh).
ENV TESSERACT_CMD=/usr/bin/tesseract \
    TESSDATA_PREFIX=/tessdata

WORKDIR /app

COPY apps/api/docker/install-tessdata.sh /tmp/install-tessdata.sh
COPY tessdata /tmp/tessdata-context
RUN chmod +x /tmp/install-tessdata.sh \
    && /tmp/install-tessdata.sh /tmp/tessdata-context \
    && rm -rf /tmp/tessdata-context

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src

COPY apps/api/pyproject.toml apps/api/alembic.ini /app/
COPY apps/api/alembic /app/alembic
COPY apps/api/src /app/src

RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir .

ENV STORAGE_ROOT=/data/storage \
    DATABASE_URL=sqlite:////data/app.db

RUN mkdir -p /data/storage

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"

CMD ["uvicorn", "translation_tool.main:app", "--host", "0.0.0.0", "--port", "8000"]
