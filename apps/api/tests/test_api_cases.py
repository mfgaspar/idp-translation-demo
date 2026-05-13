import fitz
import pytest
from fastapi.testclient import TestClient

from translation_tool.api.deps import get_settings
from translation_tool.config import Settings
from translation_tool.main import create_app


@pytest.fixture
def client(tmp_path):
    db_f = tmp_path / "api.db"
    store = tmp_path / "store"
    store.mkdir()
    settings = Settings(_env_file=None, database_url=f"sqlite:///{db_f}", storage_root=str(store))
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def test_create_case_and_upload_and_process(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "X-1"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    p = tmp_path / "doc.pdf"
    d = fitz.open()
    d.new_page().insert_text((40, 40), "Hola mundo")
    d.save(p)
    d.close()
    files = {"file": ("a.pdf", p.read_bytes(), "application/pdf")}
    r2 = client.post(f"/cases/{cid}/documents", files=files)
    assert r2.status_code == 201, r2.text
    doc_id = r2.json()["id"]
    r3 = client.post(f"/cases/{cid}/process", json={"document_id": doc_id})
    assert r3.status_code == 202, r3.text
    v = client.get(f"/cases/{cid}/viewer")
    assert v.status_code == 200
    assert len(v.json()["segments"]) >= 1


def test_review_approve(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "R-1"})
    cid = r.json()["id"]
    p = tmp_path / "d.pdf"
    doc = fitz.open()
    doc.new_page().insert_text((10, 10), "Text")
    doc.save(p)
    doc.close()
    doc_id = client.post(f"/cases/{cid}/documents", files={"file": ("d.pdf", p.read_bytes(), "application/pdf")}).json()[
        "id"
    ]
    client.post(f"/cases/{cid}/process", json={"document_id": doc_id})
    seg_id = client.get(f"/cases/{cid}/viewer").json()["segments"][0]["segment_id"]
    r4 = client.post(f"/cases/{cid}/review", json={"segment_id": seg_id, "action": "approve"})
    assert r4.status_code == 200
    assert r4.json()["status"] == "approved"


def test_evidence_forbidden_when_policy_off(client, tmp_path):
    db_f = tmp_path / "b.db"
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{db_f}",
        storage_root=str(tmp_path / "st2"),
        storage_mode="memory_only",
        allow_evidence_export=True,
    )
    (tmp_path / "st2").mkdir(exist_ok=True)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as c:
        cid = c.post("/cases/", json={"external_ref": "E-1"}).json()["id"]
        r = c.get(f"/cases/{cid}/evidence")
        assert r.status_code == 403
    get_settings.cache_clear()
