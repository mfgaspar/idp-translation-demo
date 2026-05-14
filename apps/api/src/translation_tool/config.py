import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from translation_tool.translation_languages_config import DEFAULT_TRANSLATION_LANGUAGES_JSON


def _dotenv_files() -> tuple[str, ...]:
    """Resolve .env when the API is started from apps/api (uvicorn cwd) while the file lives at repo root."""
    found: list[Path] = []
    d = Path(__file__).resolve().parent
    while True:
        env = d / ".env"
        if env.is_file():
            found.insert(0, env)
        parent = d.parent
        if parent == d:
            break
        d = parent
    return tuple(str(p) for p in found) if found else (".env",)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_dotenv_files(), extra="ignore")

    database_url: str = Field(default="sqlite:///./dev.db")
    storage_root: str = Field(default="./var/storage")
    storage_mode: str = Field(
        default="working_store",
        description="working_store | memory_only — controls whether segment text is written to DB",
    )
    allow_evidence_export: bool = Field(default=True)
    max_upload_bytes: int = Field(default=25 * 1024 * 1024)
    auth_mode: str = Field(default="none", description="none | required (stub)")
    llm_provider: str = Field(default="mock", description="mock | openai_compatible")
    llm_base_url: str = Field(default="http://localhost:11434/v1")
    llm_api_key: str = Field(default="")
    llm_model: str = Field(default="gpt-4o-mini")
    llm_auth_scheme: str = Field(
        default="bearer",
        description="bearer (OpenAI-style Authorization) | api_key (Azure resource key via api-key header)",
    )
    llm_api_version: str | None = Field(
        default=None,
        description="If set, appended as api-version query param (required for Azure OpenAI REST)",
    )
    llm_include_model_in_body: bool = Field(
        default=True,
        description="Include JSON body.model; set false for Azure deployment URLs that reject body.model",
    )
    llm_json_object_response: bool = Field(
        default=False,
        description="If true, send response_format json_object (OpenAI/Azure); omit for Ollama and older servers.",
    )
    tesseract_cmd: str | None = Field(
        default=None,
        description="Path to tesseract binary for OCR; if unset, PATH is searched (see tesseract-ocr package).",
    )
    tessdata_prefix: str | None = Field(
        default=None,
        description="Directory containing tessdata (e.g. eng.traineddata); exported as TESSDATA_PREFIX for Tesseract subprocesses.",
    )
    translation_languages_json: str = Field(
        default=DEFAULT_TRANSLATION_LANGUAGES_JSON,
        description="JSON {sources:[{code,label}],targets:[...]} — drives GET /config/translation-languages and POST /cases/{id}/process validation.",
    )


def apply_tesseract_runtime_env(settings: Settings) -> None:
    """Copy tess config from Settings into os.environ so Tesseract subprocesses see it."""
    if settings.tessdata_prefix:
        os.environ["TESSDATA_PREFIX"] = settings.tessdata_prefix
