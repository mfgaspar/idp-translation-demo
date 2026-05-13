from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from translation_tool.config import Settings

_engine = None
_SessionLocal = None


def get_engine(settings: Settings):
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(settings.database_url, future=True)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)
    return _engine


def get_session_factory(settings: Settings):
    get_engine(settings)
    return _SessionLocal


def get_db(settings: Settings) -> Generator[Session, None, None]:
    SessionLocal = get_session_factory(settings)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
