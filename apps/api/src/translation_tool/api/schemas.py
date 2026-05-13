from pydantic import BaseModel, Field


class CaseCreate(BaseModel):
    external_ref: str = Field(min_length=1, max_length=128)


class CaseOut(BaseModel):
    id: int
    external_ref: str
    status: str

    model_config = {"from_attributes": True}


class ProcessBody(BaseModel):
    document_id: int


class ReviewBody(BaseModel):
    segment_id: str
    action: str  # approve | reject | edit
    edited_text: str | None = None


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
    segments: list[ViewerSegment]
