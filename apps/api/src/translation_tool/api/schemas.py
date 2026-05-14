from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CaseCreate(BaseModel):
    external_ref: str = Field(min_length=1, max_length=128)


class CaseOut(BaseModel):
    id: int
    external_ref: str
    status: str

    model_config = {"from_attributes": True}


class CaseListItem(BaseModel):
    id: int
    external_ref: str
    status: str
    content_type: str | None
    original_filename: str | None
    avg_confidence: float | None
    primary_language: str | None
    source_language: str | None = None
    target_language: str | None = None
    created_at: datetime
    # Latest document segments only (viewer scope).
    review_approved: int = 0
    review_rejected: int = 0
    review_edited: int = 0
    review_pending: int = 0
    segment_review_complete: bool = False


class LanguageOptionOut(BaseModel):
    code: str
    label: str


class TranslationLanguagesOut(BaseModel):
    sources: list[LanguageOptionOut]
    targets: list[LanguageOptionOut]


class ProcessBody(BaseModel):
    document_id: int
    source_language: str = Field(default="auto", min_length=1, max_length=32)
    target_language: str = Field(default="en", min_length=1, max_length=32)


class ReviewBody(BaseModel):
    segment_id: str
    action: str  # approve | reject | edit
    edited_text: str | None = None


class ReviewBulkBody(BaseModel):
    """Apply the same review action to every segment on the case's latest document (viewer scope)."""

    action: Literal["approve", "reject"]


class ViewerSegment(BaseModel):
    segment_id: str
    page_number: int
    bbox: list[float]
    extracted_text: str
    translated_text: str
    confidence: float
    status: str


class ViewerOut(BaseModel):
    case_id: int
    document_id: int | None
    original_file_url: str | None
    content_type: str | None = None
    source_language: str | None = None
    target_language: str | None = None
    resolved_source_language: str | None = Field(
        default=None,
        description="Dominant detected source when source_language was auto; otherwise the chosen source code.",
    )
    segments: list[ViewerSegment]
