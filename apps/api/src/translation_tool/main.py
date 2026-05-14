import os
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from translation_tool.api.app_config import router as app_config_router
from translation_tool.api.cases import router as cases_router
from translation_tool.config import Settings, apply_tesseract_runtime_env
from translation_tool.db import get_engine
from translation_tool.models.orm import Base
from translation_tool.observability.logging import configure_logging, log_agent_action


def _upgrade_database_schema(settings: Settings) -> None:
    """Apply Alembic migrations. Handles legacy SQLite DBs created with create_all (no alembic_version)."""
    os.environ["DATABASE_URL"] = settings.database_url
    api_root = Path(__file__).resolve().parents[2]
    alembic_ini = api_root / "alembic.ini"
    if not alembic_ini.is_file():
        Base.metadata.create_all(bind=get_engine(settings))
        return
    cfg = Config(str(alembic_ini))
    try:
        command.upgrade(cfg, "head")
    except OperationalError as ex:
        msg = str(getattr(ex, "orig", None) or ex).lower()
        if "already exists" not in msg:
            raise
        command.stamp(cfg, "001_initial_schema")
        command.upgrade(cfg, "head")


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        configure_logging()
        log_agent_action(
            None,
            "startup",
            f"API starting (llm_provider={app_settings.llm_provider})",
        )
        apply_tesseract_runtime_env(app_settings)
        _upgrade_database_schema(app_settings)
        yield

    app = FastAPI(title="LLM Translation Tool API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    app.include_router(cases_router, prefix="/cases", tags=["cases"])
    app.include_router(app_config_router, prefix="/config", tags=["config"])
    return app


app = create_app()
