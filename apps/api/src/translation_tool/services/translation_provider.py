from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import httpx

from translation_tool.config import Settings


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


class OpenAICompatibleProvider:
    """POST chat/completions on an OpenAI-compatible private endpoint."""

    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self._settings = settings
        self._client = client or httpx.Client(timeout=120.0)

    def translate(self, batch: list[TranslationRequest]) -> list[TranslationResult]:
        lines = "\n".join(f"{i.segment_id}\t{i.text}" for i in batch)
        body = {
            "model": self._settings.llm_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Translate each line to English. Input lines are "
                        "TAB-separated: segment_id<TAB>text. "
                        "Reply with one line per segment: segment_id<TAB>translation. "
                        "Preserve segment_id exactly."
                    ),
                },
                {"role": "user", "content": lines},
            ],
            "temperature": 0.1,
        }
        headers = {"Content-Type": "application/json"}
        if self._settings.llm_api_key:
            headers["Authorization"] = f"Bearer {self._settings.llm_api_key}"
        base = self._settings.llm_base_url.rstrip("/")
        url = f"{base}/chat/completions"
        r = self._client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        out: dict[str, str] = {}
        for line in content.strip().splitlines():
            parts = line.split("\t", 1)
            if len(parts) == 2:
                out[parts[0].strip()] = parts[1].strip()
        model = data.get("model", self._settings.llm_model)
        return [
            TranslationResult(
                segment_id=item.segment_id,
                translated_text=out.get(item.segment_id, f"[en] {item.text}"),
                model_id=str(model),
                model_version="unknown",
                prompt_template_id="openai-compatible-v0",
            )
            for item in batch
        ]


def get_translation_provider(settings: Settings) -> TranslationProvider:
    if settings.llm_provider == "openai_compatible":
        return OpenAICompatibleProvider(settings)
    return MockTranslationProvider()
