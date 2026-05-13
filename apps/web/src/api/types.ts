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
  segments: ViewerSegment[]
}
