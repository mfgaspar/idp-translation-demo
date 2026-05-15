#!/usr/bin/env sh
# Debian/Ubuntu: system packages matching apps/api/Dockerfile (Tesseract + Poppler).
set -eu
if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script only supports apt-based systems (Debian/Ubuntu)." >&2
  exit 1
fi
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  tesseract-ocr \
  tesseract-ocr-eng \
  tesseract-ocr-chi-sim \
  tesseract-ocr-chi-tra \
  tesseract-ocr-fra \
  tesseract-ocr-deu \
  tesseract-ocr-spa \
  poppler-utils
