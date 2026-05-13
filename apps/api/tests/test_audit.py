import json

from sqlalchemy import select

from translation_tool.models.orm import AuditEvent, Case
from translation_tool.services.audit import record_event


def test_audit_append_only(db_session):
    c = Case(external_ref="AUD-1", status="draft")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    record_event(db_session, case_id=c.id, actor="system", action="ingest", details={"x": 1})
    record_event(db_session, case_id=c.id, actor="system", action="translate", details={"y": 2})
    rows = list(db_session.scalars(select(AuditEvent).where(AuditEvent.case_id == c.id).order_by(AuditEvent.id)).all())
    assert len(rows) == 2
    assert json.loads(rows[0].details_json)["x"] == 1
