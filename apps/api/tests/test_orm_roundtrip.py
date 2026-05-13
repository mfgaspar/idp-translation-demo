from translation_tool.models.orm import Case


def test_create_case(db_session):
    c = Case(external_ref="CASE-1", status="draft")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    assert c.id is not None
    assert c.external_ref == "CASE-1"
