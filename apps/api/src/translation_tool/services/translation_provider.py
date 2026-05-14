from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable
from urllib.parse import urlencode

import httpx

from translation_tool.config import Settings


class TranslationUpstreamError(RuntimeError):
    """The configured LLM HTTP endpoint failed or returned a payload we cannot use."""


@dataclass
class TranslationRequest:
    segment_id: str
    text: str
    source_language: str
    target_language: str


@dataclass
class TranslationResult:
    segment_id: str
    translated_text: str
    model_id: str
    model_version: str
    prompt_template_id: str
    detected_source_language: str | None = None


@runtime_checkable
class TranslationProvider(Protocol):
    def translate(self, batch: list[TranslationRequest]) -> list[TranslationResult]: ...


def _mock_infer_source_language(batch: list[TranslationRequest]) -> str | None:
    if not batch or batch[0].source_language != "auto":
        return None
    blob = " ".join(i.text for i in batch).lower()
    if any(w in blob for w in ("bonjour", "merci", "français")):
        return "fr"
    if any(w in blob for w in ("hola", "gracias", "mundo", "año")):
        return "es"
    if any("\u4e00" <= ch <= "\u9fff" for ch in blob):
        return "zh"
    return "en"


class MockTranslationProvider:
    def translate(self, batch: list[TranslationRequest]) -> list[TranslationResult]:
        detected = _mock_infer_source_language(batch)
        return [
            TranslationResult(
                segment_id=item.segment_id,
                translated_text=f"[{item.target_language}] {item.text}",
                model_id="mock",
                model_version="0",
                prompt_template_id="mock-v0",
                detected_source_language=detected,
            )
            for item in batch
        ]


def _strip_json_markdown_fence(content: str) -> str:
    s = content.strip()
    if not s.startswith("```"):
        return s
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _parse_translations_from_llm_content(content: str) -> tuple[dict[str, str], str | None]:
    """Map segment_id -> translated text; optional ``detected_source_language`` when JSON root has it."""
    out: dict[str, str] = {}
    detected: str | None = None
    raw = _strip_json_markdown_fence(content)
    try:
        data: Any = json.loads(raw)
    except json.JSONDecodeError:
        data = None
    if isinstance(data, dict):
        dsrc = data.get("detected_source_language")
        if isinstance(dsrc, str) and dsrc.strip():
            detected = dsrc.strip().lower()[:16]
        rows = data.get("translations")
        if isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                sid = row.get("segment_id")
                text = row.get("translated_text")
                if isinstance(sid, str) and isinstance(text, str):
                    out[sid] = text
        if out:
            return out, detected
    for line in content.strip().splitlines():
        parts = line.split("\t", 1)
        if len(parts) == 2:
            out[parts[0].strip()] = parts[1].strip()
    return out, detected


class OpenAICompatibleProvider:
    """POST chat/completions on an OpenAI-compatible private endpoint."""

    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self._settings = settings
        self._client = client or httpx.Client(timeout=120.0)

    def translate(self, batch: list[TranslationRequest]) -> list[TranslationResult]:
        if not batch:
            return []
        user_payload = json.dumps(
            {"items": [{"segment_id": i.segment_id, "text": i.text} for i in batch]},
            ensure_ascii=False,
        )
        src = batch[0].source_language
        tgt = batch[0].target_language
        src_clause = (
            "The source language is unknown: infer it from each segment's text and translate appropriately."
            if src == "auto"
            else f"The source language is identified by code {src!r}; treat each segment's text as being primarily in that language."
        )
        json_shape = (
            '{"detected_source_language":"<short language code you infer for the batch, e.g. en, fr, de, es>",'
            '"translations":[{"segment_id":"<exact id from input>","translated_text":"<translation>"}]}'
            if src == "auto"
            else '{"translations":[{"segment_id":"<exact id from input>","translated_text":"<translation>"}]}'
        )
        detected_clause = (
            "Include top-level key detected_source_language with a short ISO 639-1-style code for the dominant "
            "source language of the batch (same for all segments). "
            if src == "auto"
            else ""
        )
        sys_content = (
            "You translate document OCR segments from PDF or image OCR. "
            f"{src_clause} "
            f"Write every translations[].translated_text entry in the target language identified by code {tgt!r}. "
            f"{detected_clause}"
            "Input is JSON with key 'items': each item has segment_id (string) and text (string). "
            "Translate every item faithfully; keep layout reasonably close when helpful. "
            "Output a single JSON object only (no markdown code fences, no commentary) with shape: "
            f"{json_shape} "
            "Copy each segment_id exactly; include one translations entry per input item, same order."
        )
        body: dict = {
            "messages": [
                {
                    "role": "system",
                    "content": sys_content,
                },
                {"role": "user", "content": user_payload},
            ],
            "temperature": 0.1,
        }
        if self._settings.llm_include_model_in_body:
            body["model"] = self._settings.llm_model
        if self._settings.llm_json_object_response:
            body["response_format"] = {"type": "json_object"}
        headers = {"Content-Type": "application/json"}
        if self._settings.llm_api_key:
            scheme = (self._settings.llm_auth_scheme or "bearer").lower()
            if scheme == "api_key":
                headers["api-key"] = self._settings.llm_api_key
            else:
                headers["Authorization"] = f"Bearer {self._settings.llm_api_key}"
        base = self._settings.llm_base_url.rstrip("/")
        url = f"{base}/chat/completions"
        if self._settings.llm_api_version:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}{urlencode({'api-version': self._settings.llm_api_version})}"
        try:
            r = self._client.post(url, headers=headers, json=body)
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            detail = f"HTTP {e.response.status_code}"
            try:
                err = e.response.json()
                if isinstance(err, dict):
                    inner = err.get("error")
                    if isinstance(inner, dict) and isinstance(inner.get("message"), str):
                        detail = f"{detail}: {inner['message']}"
                    elif isinstance(inner, str):
                        detail = f"{detail}: {inner}"
                    else:
                        detail = f"{detail}: {json.dumps(err)[:400]}"
            except json.JSONDecodeError:
                snippet = (e.response.text or "")[:400]
                if snippet:
                    detail = f"{detail}: {snippet}"
            raise TranslationUpstreamError(detail) from e
        except httpx.RequestError as e:
            raise TranslationUpstreamError(f"request failed: {e!s}") from e

        try:
            data = r.json()
        except json.JSONDecodeError as e:
            raise TranslationUpstreamError(f"response was not valid JSON ({e!s})") from e

        try:
            msg = data["choices"][0]["message"]
            content = msg["content"]
        except (KeyError, IndexError, TypeError) as e:
            raise TranslationUpstreamError("missing choices[0].message.content in provider response") from e

        if not isinstance(content, str):
            raise TranslationUpstreamError("provider message content was not a string")

        out, detected_src = _parse_translations_from_llm_content(content)
        model = data.get("model", self._settings.llm_model)
        return [
            TranslationResult(
                segment_id=item.segment_id,
                translated_text=out.get(item.segment_id, f"[{item.target_language}] {item.text}"),
                model_id=str(model),
                model_version="unknown",
                prompt_template_id="openai-compatible-v1",
                detected_source_language=detected_src if src == "auto" else None,
            )
            for item in batch
        ]


def get_translation_provider(settings: Settings) -> TranslationProvider:
    if settings.llm_provider == "openai_compatible":
        return OpenAICompatibleProvider(settings)
    return MockTranslationProvider()
