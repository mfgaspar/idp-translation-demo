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


def test_viewer_segments_match_latest_document_only(client, tmp_path):
    """Viewer uses the newest document for the PDF; segments must be for that document only."""
    r = client.post("/cases/", json={"external_ref": "VDOC-1"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]

    def upload_and_process(label: str) -> None:
        p = tmp_path / f"{label}.pdf"
        d = fitz.open()
        d.new_page().insert_text((40, 40), label)
        d.save(p)
        d.close()
        files = {"file": ("x.pdf", p.read_bytes(), "application/pdf")}
        up = client.post(f"/cases/{cid}/documents", files=files)
        assert up.status_code == 201, up.text
        doc_id = up.json()["id"]
        pr = client.post(f"/cases/{cid}/process", json={"document_id": doc_id})
        assert pr.status_code == 202, pr.text

    upload_and_process("AAA_UNIQUE_OLD")
    upload_and_process("BBB_UNIQUE_NEW")

    v = client.get(f"/cases/{cid}/viewer")
    assert v.status_code == 200
    body = v.json()
    texts = " ".join(s["extracted_text"] + s["translated_text"] for s in body["segments"])
    assert "BBB_UNIQUE_NEW" in texts
    assert "AAA_UNIQUE_OLD" not in texts
    assert len(body["segments"]) >= 1


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
    r3 = client.post(
        f"/cases/{cid}/process",
        json={"document_id": doc_id, "source_language": "es", "target_language": "en"},
    )
    assert r3.status_code == 202, r3.text
    v = client.get(f"/cases/{cid}/viewer")
    assert v.status_code == 200
    assert len(v.json()["segments"]) >= 1
    listed = client.get("/cases/").json()
    row = next((x for x in listed if x["id"] == cid), None)
    assert row is not None
    assert row.get("source_language") == "es"
    assert row.get("target_language") == "en"


def test_list_cases_primary_language_after_auto_detect(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "AUTO-LANG-1"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    p = tmp_path / "doc.pdf"
    d = fitz.open()
    d.new_page().insert_text((40, 40), "Bonjour le monde")
    d.save(p)
    d.close()
    files = {"file": ("a.pdf", p.read_bytes(), "application/pdf")}
    r2 = client.post(f"/cases/{cid}/documents", files=files)
    assert r2.status_code == 201, r.text
    doc_id = r2.json()["id"]
    r3 = client.post(
        f"/cases/{cid}/process",
        json={"document_id": doc_id, "source_language": "auto", "target_language": "en"},
    )
    assert r3.status_code == 202, r3.text
    listed = client.get("/cases/").json()
    row = next((x for x in listed if x["id"] == cid), None)
    assert row is not None
    assert row.get("source_language") == "auto"
    assert row.get("target_language") == "en"
    assert row.get("primary_language") == "fr"
    v = client.get(f"/cases/{cid}/viewer").json()
    assert v.get("resolved_source_language") == "fr"
    assert v.get("source_language") == "auto"
def test_list_cases(client, tmp_path):
    client.post("/cases/", json={"external_ref": "L-1"})
    client.post("/cases/", json={"external_ref": "L-2"})
    r = client.get("/cases/")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) >= 2
    refs = {row["external_ref"] for row in rows}
    assert "L-1" in refs and "L-2" in refs
    assert all(
        "id" in row and "status" in row and "created_at" in row and "review_approved" in row for row in rows
    )
    assert all(
        "review_rejected" in row and "review_pending" in row and "review_edited" in row and "segment_review_complete" in row
        for row in rows
    )
    assert all("source_language" in row and "target_language" in row for row in rows)


def test_review_bulk_approve_all(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "RB-1"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    p = tmp_path / "bulk.pdf"
    doc = fitz.open()
    doc.new_page().insert_text((10, 10), "One")
    doc.new_page().insert_text((10, 10), "Two")
    doc.save(p)
    doc.close()
    up = client.post(f"/cases/{cid}/documents", files={"file": ("b.pdf", p.read_bytes(), "application/pdf")})
    assert up.status_code == 201, up.text
    doc_id = up.json()["id"]
    assert client.post(f"/cases/{cid}/process", json={"document_id": doc_id}).status_code == 202
    segs = client.get(f"/cases/{cid}/viewer").json()["segments"]
    assert len(segs) >= 2
    rb = client.post(f"/cases/{cid}/review-bulk", json={"action": "approve"})
    assert rb.status_code == 200, rb.text
    assert rb.json()["updated"] == len(segs)
    after = client.get(f"/cases/{cid}/viewer").json()["segments"]
    assert all(s["status"] == "approved" for s in after)
    listed = next(x for x in client.get("/cases/").json() if x["id"] == cid)
    assert listed["segment_review_complete"] is True
    assert listed["review_pending"] == 0


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
    listed = next(x for x in client.get("/cases/").json() if x["id"] == cid)
    assert listed["review_approved"] == 1
    assert listed["review_rejected"] == 0
    assert listed["review_edited"] == 0
    assert listed["review_pending"] == 0
    assert listed["segment_review_complete"] is True


def test_delete_case_allowed_when_not_archived(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "DEL-ACTIVE"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    d = client.delete(f"/cases/{cid}")
    assert d.status_code == 204, d.text
    assert client.get(f"/cases/{cid}").status_code == 404


def test_delete_case_forbidden_when_review_complete(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "DEL-ARCH"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    p = tmp_path / "arc.pdf"
    doc = fitz.open()
    doc.new_page().insert_text((10, 10), "X")
    doc.save(p)
    doc.close()
    doc_id = client.post(f"/cases/{cid}/documents", files={"file": ("a.pdf", p.read_bytes(), "application/pdf")}).json()[
        "id"
    ]
    assert client.post(f"/cases/{cid}/process", json={"document_id": doc_id}).status_code == 202
    segs = client.get(f"/cases/{cid}/viewer").json()["segments"]
    assert len(segs) >= 1
    assert client.post(f"/cases/{cid}/review-bulk", json={"action": "approve"}).status_code == 200
    listed = next(x for x in client.get("/cases/").json() if x["id"] == cid)
    assert listed["segment_review_complete"] is True
    d = client.delete(f"/cases/{cid}")
    assert d.status_code == 409, d.text


def test_unarchive_resets_pending_and_allows_upload(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "UNA-1"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    p = tmp_path / "u.pdf"
    doc = fitz.open()
    doc.new_page().insert_text((10, 10), "Hi")
    doc.save(p)
    doc.close()
    doc_id = client.post(f"/cases/{cid}/documents", files={"file": ("u.pdf", p.read_bytes(), "application/pdf")}).json()[
        "id"
    ]
    assert client.post(f"/cases/{cid}/process", json={"document_id": doc_id}).status_code == 202
    assert client.post(f"/cases/{cid}/review-bulk", json={"action": "approve"}).status_code == 200
    listed = next(x for x in client.get("/cases/").json() if x["id"] == cid)
    assert listed["segment_review_complete"] is True
    ua = client.post(f"/cases/{cid}/unarchive")
    assert ua.status_code == 200, ua.text
    listed2 = next(x for x in client.get("/cases/").json() if x["id"] == cid)
    assert listed2["segment_review_complete"] is False
    assert listed2["review_pending"] >= 1
    v = client.get(f"/cases/{cid}/viewer").json()
    assert any(s["status"] == "auto" for s in v["segments"])
    p2 = tmp_path / "u2.pdf"
    d2 = fitz.open()
    d2.new_page().insert_text((10, 10), "Again")
    d2.save(p2)
    d2.close()
    up2 = client.post(f"/cases/{cid}/documents", files={"file": ("u2.pdf", p2.read_bytes(), "application/pdf")})
    assert up2.status_code == 201, up2.text


def test_upload_forbidden_when_archived(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "BLK-UP"})
    cid = r.json()["id"]
    p = tmp_path / "b.pdf"
    doc = fitz.open()
    doc.new_page().insert_text((10, 10), "X")
    doc.save(p)
    doc.close()
    doc_id = client.post(f"/cases/{cid}/documents", files={"file": ("b.pdf", p.read_bytes(), "application/pdf")}).json()[
        "id"
    ]
    client.post(f"/cases/{cid}/process", json={"document_id": doc_id})
    client.post(f"/cases/{cid}/review-bulk", json={"action": "approve"})
    p2 = tmp_path / "blocked.pdf"
    d2 = fitz.open()
    d2.new_page().insert_text((10, 10), "Nope")
    d2.save(p2)
    d2.close()
    blocked = client.post(f"/cases/{cid}/documents", files={"file": ("n.pdf", p2.read_bytes(), "application/pdf")})
    assert blocked.status_code == 409, blocked.text


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


def test_config_translation_languages(client, tmp_path):
    r = client.get("/config/translation-languages")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["sources"], list) and len(body["sources"]) >= 1
    assert isinstance(body["targets"], list) and len(body["targets"]) >= 1
    assert "code" in body["sources"][0] and "label" in body["sources"][0]


def test_process_rejects_invalid_target_language(client, tmp_path):
    r = client.post("/cases/", json={"external_ref": "LANG-BAD"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    p = tmp_path / "badlang.pdf"
    d = fitz.open()
    d.new_page().insert_text((40, 40), "Hi")
    d.save(p)
    d.close()
    doc_id = client.post(f"/cases/{cid}/documents", files={"file": ("a.pdf", p.read_bytes(), "application/pdf")}).json()[
        "id"
    ]
    pr = client.post(
        f"/cases/{cid}/process",
        json={"document_id": doc_id, "source_language": "auto", "target_language": "not_in_list"},
    )
    assert pr.status_code == 400, pr.text


def test_process_returns_502_when_translation_upstream_fails(client, tmp_path, monkeypatch):
    from translation_tool.api import cases as cases_module
    from translation_tool.services.translation_provider import TranslationUpstreamError

    class _BadProvider:
        def translate(self, batch):
            raise TranslationUpstreamError("HTTP 401: denied")

    monkeypatch.setattr(cases_module, "get_translation_provider", lambda _settings: _BadProvider())

    r = client.post("/cases/", json={"external_ref": "UP-502"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    p = tmp_path / "doc.pdf"
    d = fitz.open()
    d.new_page().insert_text((40, 40), "Hello")
    d.save(p)
    d.close()
    doc_id = client.post(f"/cases/{cid}/documents", files={"file": ("a.pdf", p.read_bytes(), "application/pdf")}).json()[
        "id"
    ]
    pr = client.post(
        f"/cases/{cid}/process",
        json={"document_id": doc_id, "source_language": "en", "target_language": "de"},
    )
    assert pr.status_code == 502, pr.text
    assert "401" in pr.json()["detail"]
