export type ViewerSegment = {
  segment_id: string
  page_number: number
  bbox: number[]
  extracted_text: string
  translated_text: string
  confidence: number
  status: string
}

export type ViewerResponse = {
  case_id: number
  document_id: number | null
  original_file_url: string | null
  content_type: string | null
  /** Languages stored on the latest document after a successful process run. */
  source_language: string | null
  target_language: string | null
  /** Dominant inferred source when source was auto; otherwise the fixed source code. */
  resolved_source_language: string | null
  segments: ViewerSegment[]
}
