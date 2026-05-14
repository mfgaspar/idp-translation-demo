export type CaseListItem = {
  id: number
  external_ref: string
  status: string
  content_type: string | null
  original_filename: string | null
  avg_confidence: number | null
  primary_language: string | null
  /** Latest document: languages chosen when running process (null if not processed). */
  source_language: string | null
  target_language: string | null
  created_at: string
  /** Latest document segments only (matches workspace viewer). */
  review_approved: number
  review_rejected: number
  review_edited: number
  review_pending: number
  /** True when the latest document has segments and none are still `auto` (all approved, rejected, or edited). */
  segment_review_complete: boolean
}

export async function fetchCases(): Promise<CaseListItem[]> {
  const r = await fetch('/cases/')
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<CaseListItem[]>
}

export async function createCase(): Promise<{ id: number }> {
  const r = await fetch('/cases/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ external_ref: `ui-${crypto.randomUUID()}` }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<{ id: number }>
}

/** Removes the case and related data. The API returns 409 when segment review is complete (archived). */
export async function deleteCase(id: number): Promise<void> {
  const r = await fetch(`/cases/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(await r.text())
}

/** Resets latest-document segments to pending (`auto`). The API returns 400 when the case is not archived. */
export async function unarchiveCase(id: number): Promise<void> {
  const r = await fetch(`/cases/${id}/unarchive`, { method: 'POST' })
  if (!r.ok) throw new Error(await r.text())
}
