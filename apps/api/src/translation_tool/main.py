from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from translation_tool.api.cases import router as cases_router
from translation_tool.config import Settings
from translation_tool.db import get_engine
from translation_tool.models.orm import Base
from translation_tool.observability.logging import configure_logging, log_agent_action


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        configure_logging()
        log_agent_action(None, "startup", "API starting")
        Base.metadata.create_all(bind=get_engine(app_settings))
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
    return app


app = create_app()
