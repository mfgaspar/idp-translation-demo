"""Configurable source/target language options for translation (JSON in Settings)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LanguageOption(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=128)


class TranslationLanguagesConfig(BaseModel):
    sources: list[LanguageOption] = Field(min_length=1)
    targets: list[LanguageOption] = Field(min_length=1)


DEFAULT_TRANSLATION_LANGUAGES_JSON = TranslationLanguagesConfig(
    sources=[
        LanguageOption(code="auto", label="Auto-detect"),
        LanguageOption(code="en", label="English"),
        LanguageOption(code="zh", label="Chinese"),
        LanguageOption(code="fr", label="French"),
        LanguageOption(code="de", label="German"),
        LanguageOption(code="es", label="Spanish"),
    ],
    targets=[
        LanguageOption(code="en", label="English"),
        LanguageOption(code="zh", label="Chinese"),
        LanguageOption(code="fr", label="French"),
        LanguageOption(code="de", label="German"),
        LanguageOption(code="es", label="Spanish"),
        LanguageOption(code="pt", label="Portuguese"),
    ],
).model_dump_json()


def parse_translation_languages_json(raw: str) -> TranslationLanguagesConfig:
    try:
        return TranslationLanguagesConfig.model_validate_json(raw)
    except Exception:
        return TranslationLanguagesConfig.model_validate_json(DEFAULT_TRANSLATION_LANGUAGES_JSON)


def validate_process_languages(cfg: TranslationLanguagesConfig, source: str, target: str) -> None:
    source_ok = any(o.code == source for o in cfg.sources)
    target_ok = any(o.code == target for o in cfg.targets)
    if not source_ok:
        raise ValueError(f"invalid source_language {source!r}")
    if not target_ok:
        raise ValueError(f"invalid target_language {target!r}")
