# OCR runtime: Tesseract + Poppler (for PDF rasterization used by PyMuPDF).
FROM python:3.12-slim-bookworm AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-chi-sim \
        tesseract-ocr-chi-tra \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src

COPY pyproject.toml alembic.ini /app/
COPY alembic /app/alembic
COPY src /app/src

RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir .

# Writable volume mount points (compose binds a volume here).
ENV STORAGE_ROOT=/data/storage \
    DATABASE_URL=sqlite:////data/app.db

RUN mkdir -p /data/storage

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"

CMD ["uvicorn", "translation_tool.main:app", "--host", "0.0.0.0", "--port", "8000"]
