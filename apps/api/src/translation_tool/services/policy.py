from translation_tool.config import Settings


def persist_extracted_text_allowed(settings: Settings) -> bool:
    return settings.storage_mode != "memory_only"


def evidence_export_allowed(settings: Settings) -> bool:
    return settings.allow_evidence_export and settings.storage_mode != "memory_only"
