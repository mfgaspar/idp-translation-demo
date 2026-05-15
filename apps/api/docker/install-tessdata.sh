#!/bin/sh
set -eu

TESSDATA_DIR="${TESSDATA_DIR:-/tessdata}"
MOUNT_DIR="${1:-}"

# Tesseract traineddata ids for default UI source languages (en, zh, fr, de, es).
TESSLANGS="eng deu fra spa chi_sim chi_tra"

mkdir -p "$TESSDATA_DIR"

if [ -n "$MOUNT_DIR" ] && [ -d "$MOUNT_DIR" ]; then
  for lang in $TESSLANGS; do
    src="$MOUNT_DIR/${lang}.traineddata"
    if [ -f "$src" ]; then
      cp -a "$src" "$TESSDATA_DIR/"
    fi
  done
fi

for lang in $TESSLANGS; do
  if [ ! -f "${TESSDATA_DIR}/${lang}.traineddata" ]; then
    echo "Downloading tessdata_fast: ${lang}"
    curl -fsSL "https://github.com/tesseract-ocr/tessdata_fast/raw/main/${lang}.traineddata" \
      -o "${TESSDATA_DIR}/${lang}.traineddata"
  fi
done

# Line-level OCR uses ``tesseract ... tsv``; that mode needs configs/tsv under TESSDATA_PREFIX.
if [ -n "$MOUNT_DIR" ] && [ -d "$MOUNT_DIR/configs" ]; then
  cp -a "$MOUNT_DIR/configs" "${TESSDATA_DIR}/configs"
elif [ ! -f "${TESSDATA_DIR}/configs/tsv" ]; then
  for deb_configs in /usr/share/tesseract-ocr/*/tessdata/configs; do
    if [ -d "$deb_configs" ]; then
      cp -a "$deb_configs" "${TESSDATA_DIR}/configs"
      break
    fi
  done
fi

if [ ! -f "${TESSDATA_DIR}/configs/tsv" ]; then
  echo "warning: missing ${TESSDATA_DIR}/configs/tsv — OCR may fall back to one segment per page" >&2
fi

echo "Tessdata ready under ${TESSDATA_DIR} ($(ls "${TESSDATA_DIR}"/*.traineddata | wc -l) traineddata files)"
