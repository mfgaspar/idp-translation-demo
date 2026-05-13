from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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
