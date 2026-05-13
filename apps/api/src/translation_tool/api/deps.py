from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from translation_tool.config import Settings
from translation_tool.db import get_db as db_session_from_settings


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_db(settings: Annotated[Settings, Depends(get_settings)]):
    yield from db_session_from_settings(settings)


def get_current_actor(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if settings.auth_mode == "none":
        return "anonymous"
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    return "authenticated"
