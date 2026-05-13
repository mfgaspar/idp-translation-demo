from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from translation_tool.models.orm import AuditEvent


def record_event(db: Session, *, case_id: int, actor: str, action: str, details: dict[str, Any]) -> None:
    ev = AuditEvent(case_id=case_id, actor=actor, action=action, details_json=json.dumps(details))
    db.add(ev)
    db.commit()
