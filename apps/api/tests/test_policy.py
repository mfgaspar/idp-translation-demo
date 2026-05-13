from translation_tool.config import Settings
from translation_tool.services.policy import evidence_export_allowed, persist_extracted_text_allowed


def test_default_settings_allow_persist_and_export():
    s = Settings(_env_file=None)
    assert persist_extracted_text_allowed(s) is True
    assert evidence_export_allowed(s) is True


def test_strict_memory_mode_disables_persist_and_export():
    s = Settings(
        _env_file=None,
        storage_mode="memory_only",
        allow_evidence_export=False,
    )
    assert persist_extracted_text_allowed(s) is False
    assert evidence_export_allowed(s) is False
