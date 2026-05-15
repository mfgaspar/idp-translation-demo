import { startTransition, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DocumentTypeIcon } from '../lib/DocumentTypeIcon'
import { documentTypeLabel, translationDirectionTags } from '../lib/caseDisplay'

type InputReference = {
  type: string
  filename: string
  sha256: string
  document_id: number
}

type AuditTrailEntry = {
  actor: string
  action: string
  details: Record<string, unknown>
}

type SegmentCounts = {
  approved: number
  rejected: number
  pending: number
  edited: number
}

type EvidencePayload = {
  case_id: number
  external_ref: string | null
  status: string
  /** True when every segment on the latest document is reviewed (dashboard "archived"). */
  segment_review_complete: boolean
  /** Segments tied to the latest uploaded document (same scope as review listing). */
  latest_document_segment_count: number
  source_language: string | null
  target_language: string | null
  primary_language: string | null
  latest_document_content_type: string | null
  latest_document_original_filename: string | null
  segment_counts: SegmentCounts
  input_references: InputReference[]
  segments: unknown[]
  audit_trail: AuditTrailEntry[]
}

type Props = {
  initialCaseId: number | null
  onSelectedCaseChange?: (caseId: number | null) => void
  onOpenWorkspace: (caseId: number) => void
  /** Below `md`: hide navigation into the segment workspace. */
  workspaceDisabled?: boolean
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object'
}

function parseOptionalStringField(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key]
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return null
  return v
}

function countSegmentsFromRows(segments: unknown[]): SegmentCounts {
  let approved = 0
  let rejected = 0
  let pending = 0
  let edited = 0
  for (const s of segments) {
    if (!isRecord(s)) continue
    const st = s.status
    if (st === 'approved') approved++
    else if (st === 'rejected') rejected++
    else if (st === 'auto') pending++
    else if (st === 'edited') edited++
  }
  return { approved, rejected, pending, edited }
}

function parseSegmentCounts(raw: Record<string, unknown>, segments: unknown[]): SegmentCounts {
  const sc = raw.segment_counts
  if (isRecord(sc)) {
    const a = sc.approved
    const r = sc.rejected
    const p = sc.pending
    const e = sc.edited
    if (
      typeof a === 'number' &&
      Number.isFinite(a) &&
      typeof r === 'number' &&
      Number.isFinite(r) &&
      typeof p === 'number' &&
      Number.isFinite(p) &&
      typeof e === 'number' &&
      Number.isFinite(e)
    ) {
      return { approved: a, rejected: r, pending: p, edited: e }
    }
  }
  return countSegmentsFromRows(segments)
}

function parseEvidencePayload(raw: unknown): EvidencePayload | null {
  if (!isRecord(raw)) return null
  const caseId = raw.case_id
  if (typeof caseId !== 'number' || !Number.isFinite(caseId)) return null
  const status = raw.status
  if (typeof status !== 'string') return null
  const externalRefRaw = raw.external_ref
  if (externalRefRaw != null && typeof externalRefRaw !== 'string') return null
  const external_ref: string | null = externalRefRaw ?? null
  const refs = raw.input_references
  if (!Array.isArray(refs)) return null
  const input_references: InputReference[] = []
  for (const r of refs) {
    if (!isRecord(r)) return null
    if (typeof r.type !== 'string' || typeof r.filename !== 'string' || typeof r.sha256 !== 'string') return null
    const docId = r.document_id
    if (typeof docId !== 'number' || !Number.isFinite(docId)) return null
    input_references.push({ type: r.type, filename: r.filename, sha256: r.sha256, document_id: docId })
  }
  const segments = raw.segments
  if (!Array.isArray(segments)) return null
  const source_language = parseOptionalStringField(raw, 'source_language')
  const target_language = parseOptionalStringField(raw, 'target_language')
  const primary_language = parseOptionalStringField(raw, 'primary_language')
  const ctFromApi = parseOptionalStringField(raw, 'latest_document_content_type')
  const fnFromApi = parseOptionalStringField(raw, 'latest_document_original_filename')
  const lastRef = input_references.length > 0 ? input_references[input_references.length - 1] : null
  const latest_document_content_type = ctFromApi ?? lastRef?.type ?? null
  const latest_document_original_filename = fnFromApi ?? lastRef?.filename ?? null
  const segment_counts = parseSegmentCounts(raw, segments)
  const srcComplete = raw.segment_review_complete
  const segment_review_complete = typeof srcComplete === 'boolean' ? srcComplete : false
  const ldcRaw = raw.latest_document_segment_count
  const latest_document_segment_count =
    typeof ldcRaw === 'number' && Number.isFinite(ldcRaw) && ldcRaw >= 0 ? Math.floor(ldcRaw) : 0
  const trail = raw.audit_trail
  if (!Array.isArray(trail)) return null
  const audit_trail: AuditTrailEntry[] = []
  for (const a of trail) {
    if (!isRecord(a)) return null
    if (typeof a.actor !== 'string' || typeof a.action !== 'string') return null
    const det = a.details
    const details: Record<string, unknown> = isRecord(det) ? det : {}
    audit_trail.push({ actor: a.actor, action: a.action, details })
  }
  return {
    case_id: caseId,
    external_ref,
    status,
    segment_review_complete,
    latest_document_segment_count,
    source_language,
    target_language,
    primary_language,
    latest_document_content_type,
    latest_document_original_filename,
    segment_counts,
    input_references,
    segments,
    audit_trail,
  }
}

function statusChipClass(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('complete') || s === 'done') return 'bg-tint-mint/40 text-brand-green'
  if (s.includes('pending') || s.includes('progress')) return 'bg-tint-amber/35 text-on-surface'
  if (s.includes('error') || s.includes('fail')) return 'bg-error-container/35 text-error'
  return 'bg-surface-container-high text-on-surface-variant'
}

function humanizeFieldKey(key: string): string {
  if (!key) return key
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function UnknownDetailValue({ value, depth }: { value: unknown; depth: number }): ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-on-surface-variant">—</span>
  }
  if (typeof value === 'boolean') {
    return <span>{value ? 'Yes' : 'No'}</span>
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return <span>{String(value)}</span>
  }
  if (typeof value === 'string') {
    const long = value.length > 280
    const shown = long ? `${value.slice(0, 280)}…` : value
    return (
      <span className="break-words" title={long ? value : undefined}>
        {shown}
      </span>
    )
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-on-surface-variant">None</span>
    }
    const allPrimitive = value.every(
      (x) => x === null || x === undefined || ['string', 'number', 'boolean'].includes(typeof x),
    )
    if (allPrimitive) {
      return (
        <ul className="list-disc space-y-xxs pl-md">
          {value.map((x, i) => (
            <li key={i}>
              <UnknownDetailValue value={x} depth={depth} />
            </li>
          ))}
        </ul>
      )
    }
    if (depth >= 2) {
      return <span className="text-on-surface-variant italic">Nested list — see full export</span>
    }
    return (
      <ul className="list-decimal space-y-xs pl-md">
        {value.map((x, i) => (
          <li key={i}>
            <UnknownDetailValue value={x} depth={depth + 1} />
          </li>
        ))}
      </ul>
    )
  }
  if (isRecord(value)) {
    if (depth >= 2) {
      return <span className="text-on-surface-variant italic">Nested record — see full export</span>
    }
    return <DetailAttributeList details={value} depth={depth + 1} />
  }
  return <span className="text-on-surface-variant italic">See full export</span>
}

function DetailAttributeList({ details, depth }: { details: Record<string, unknown>; depth: number }): ReactNode {
  const keys = Object.keys(details).sort()
  if (keys.length === 0) {
    return <span className="text-on-surface-variant">No fields</span>
  }
  return (
    <div className="space-y-sm">
      {keys.map((k) => (
        <div key={k} className="flex flex-col gap-xxs sm:flex-row sm:items-baseline sm:gap-md">
          <span className="shrink-0 text-xs font-semibold text-outline sm:w-36">{humanizeFieldKey(k)}</span>
          <div className="min-w-0 flex-1 text-sm leading-relaxed">
            <UnknownDetailValue value={details[k]} depth={depth} />
          </div>
        </div>
      ))}
    </div>
  )
}

function AuditDetailsContent({ action, details }: { action: string; details: Record<string, unknown> }): ReactNode {
  const keys = Object.keys(details)
  if (keys.length === 0) {
    return <span className="text-sm text-on-surface-variant">No additional details for this event.</span>
  }

  if (action === 'ingest' && details.step === 'case_created') {
    return <p className="text-sm leading-relaxed text-on-surface">A new case was registered in the system.</p>
  }

  if (action === 'ingest' && typeof details.document_id === 'number') {
    return (
      <div className="space-y-sm text-sm leading-relaxed text-on-surface">
        <p>
          File ingested and stored as <span className="font-medium text-on-background">document #{details.document_id}</span>.
        </p>
        {typeof details.sha256 === 'string' && details.sha256 ? (
          <p className="text-xs text-on-surface-variant">
            File checksum (SHA-256):{' '}
            <span className="break-all font-mono text-on-surface">{details.sha256}</span>
          </p>
        ) : null}
      </div>
    )
  }

  if (action === 'extract') {
    const docId = details.document_id
    return (
      <p className="text-sm leading-relaxed text-on-surface">
        OCR extracted text regions from{' '}
        {typeof docId === 'number' ? (
          <span className="font-medium text-on-background">document #{docId}</span>
        ) : (
          'the uploaded document'
        )}
        .
      </p>
    )
  }

  if (action === 'translate') {
    const n = details.segments
    const src = details.source_language
    const tgt = details.target_language
    const model = details.model_id
    const countPart =
      typeof n === 'number' ? (
        <>
          <span className="font-medium text-on-background">{n}</span> segment{n === 1 ? '' : 's'}{' '}
        </>
      ) : (
        'Segments '
      )
    const langPart =
      typeof src === 'string' && typeof tgt === 'string' ? (
        <>
          from <span className="font-medium text-on-background">{src}</span> to{' '}
          <span className="font-medium text-on-background">{tgt}</span>
        </>
      ) : null
    const modelPart =
      typeof model === 'string' && model.trim() ? (
        <>
          {' '}
          using <span className="font-medium text-on-background">{model}</span>
        </>
      ) : null
    return (
      <p className="text-sm leading-relaxed text-on-surface">
        {countPart}
        {langPart ? <>were machine-translated {langPart}</> : 'were machine-translated'}
        {modelPart}.
      </p>
    )
  }

  if ((action === 'approve' || action === 'reject' || action === 'edit') && details.bulk === true) {
    const docId = details.document_id
    const count = details.count
    const verb = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'updated'
    return (
      <p className="text-sm leading-relaxed text-on-surface">
        Bulk {action}:{' '}
        {typeof count === 'number' ? (
          <>
            <span className="font-medium text-on-background">{count}</span> segment{count === 1 ? '' : 's'}
          </>
        ) : (
          'Multiple segments'
        )}{' '}
        on{' '}
        {typeof docId === 'number' ? <span className="font-medium text-on-background">document #{docId}</span> : 'the latest document'}{' '}
        were marked <span className="font-medium text-on-background">{verb}</span>.
      </p>
    )
  }

  if (action === 'approve' || action === 'reject' || action === 'edit') {
    if (typeof details.segment_id === 'string') {
      const verb =
        action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Translation edited and saved for'
      return (
        <div className="space-y-xs text-sm leading-relaxed text-on-surface">
          <p>
            {verb} one segment in the workspace.
          </p>
          <p className="text-xs text-on-surface-variant">
            Segment reference:{' '}
            <code className="rounded bg-surface-container px-xs py-xxs font-mono text-on-surface">{details.segment_id}</code>
          </p>
        </div>
      )
    }
  }

  if (action === 'unarchive') {
    const docId = details.document_id
    const n = details.segments_reset
    return (
      <p className="text-sm leading-relaxed text-on-surface">
        Case was taken out of archive:{' '}
        {typeof n === 'number' ? (
          <>
            <span className="font-medium text-on-background">{n}</span> segment{n === 1 ? '' : 's'}
          </>
        ) : (
          'Segments'
        )}{' '}
        on{' '}
        {typeof docId === 'number' ? <span className="font-medium text-on-background">document #{docId}</span> : 'the document'}{' '}
        returned to <span className="font-medium text-on-background">automatic review</span>.
      </p>
    )
  }

  return <DetailAttributeList details={details} depth={0} />
}

function reviewListingCopy(evidence: EvidencePayload): { pill: string; pillClass: string; line: string } {
  if (evidence.segment_review_complete) {
    return {
      pill: 'Archived',
      pillClass: 'bg-tint-mint/40 text-brand-green',
      line: 'Every segment on the latest document is approved, rejected, or edited. This case appears under Archived cases in the dashboard.',
    }
  }
  if (evidence.latest_document_segment_count > 0) {
    return {
      pill: 'Active for review',
      pillClass: 'bg-tint-amber/35 text-on-surface',
      line: 'At least one segment on the latest document is still in automatic review. This case appears under Active cases.',
    }
  }
  return {
    pill: 'Not in review yet',
    pillClass: 'bg-surface-container-high text-on-surface-variant',
    line: 'There are no segments on the latest file yet. Upload and run translation to populate the workspace.',
  }
}

function pipelineCaption(evidence: EvidencePayload): string | null {
  const s = evidence.status.toLowerCase()
  if (s === 'processed' && evidence.segment_review_complete) {
    return 'Processed with review complete — archived in the dashboard.'
  }
  if (s === 'processed' && evidence.latest_document_segment_count > 0 && !evidence.segment_review_complete) {
    return 'Processed and active: translation has finished; segment review is still open on the latest document.'
  }
  if (s === 'processed') {
    return 'Pipeline status is processed; the latest document does not yet have a segment queue to review.'
  }
  if (s === 'draft') {
    return 'Draft: the case exists but has not finished processing, or is waiting for upload and translation.'
  }
  return null
}

function CaseLifecycleBanner({ evidence }: { evidence: EvidencePayload }) {
  const review = reviewListingCopy(evidence)
  const pipeNote = pipelineCaption(evidence)
  return (
    <div className="border-b border-hairline bg-surface-container-low/40 px-lg py-lg">
      <div className="grid gap-lg lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-outline">Review listing</p>
          <p className="mt-sm">
            <span className={`inline-block rounded-full px-md py-xxs text-xs font-bold ${review.pillClass}`}>{review.pill}</span>
          </p>
          <p className="mt-sm text-sm leading-relaxed text-on-surface-variant">{review.line}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-outline">Pipeline</p>
          <p className="mt-sm">
            <span
              className={`inline-block rounded-full px-md py-xxs text-xs font-bold capitalize ${statusChipClass(evidence.status)}`}
            >
              {evidence.status.replace(/_/g, ' ')}
            </span>
          </p>
          {pipeNote ? <p className="mt-sm text-sm leading-relaxed text-on-surface-variant">{pipeNote}</p> : null}
        </div>
      </div>
    </div>
  )
}

export function AuditEvidencePage({
  initialCaseId,
  onSelectedCaseChange,
  onOpenWorkspace,
  workspaceDisabled = false,
}: Props) {
  const [caseIdInput, setCaseIdInput] = useState(initialCaseId != null ? String(initialCaseId) : '')
  const [evidence, setEvidence] = useState<EvidencePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const evidenceJson = useMemo(
    () => (evidence ? JSON.stringify(evidence, null, 2) : null),
    [evidence],
  )

  const translationTags = useMemo(
    () =>
      evidence
        ? translationDirectionTags({
            source_language: evidence.source_language,
            target_language: evidence.target_language,
            primary_language: evidence.primary_language,
          })
        : null,
    [evidence],
  )

  const loadEvidenceForCaseId = useCallback(async (caseIdStr: string) => {
    const id = Number(caseIdStr.trim())
    if (!Number.isFinite(id) || id < 1) {
      setError('Enter a valid case id')
      setEvidence(null)
      return
    }
    setError(null)
    setLoading(true)
    setEvidence(null)
    try {
      const r = await fetch(`/cases/${id}/evidence`)
      const text = await r.text()
      if (!r.ok) {
        try {
          const j = JSON.parse(text) as { detail?: string }
          setError(j.detail ?? text)
        } catch {
          setError(text)
        }
        return
      }
      const data: unknown = JSON.parse(text)
      const parsed = parseEvidencePayload(data)
      if (parsed == null) {
        setError('Unexpected evidence response shape')
        return
      }
      setEvidence(parsed)
      onSelectedCaseChange?.(parsed.case_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [onSelectedCaseChange])

  useEffect(() => {
    if (initialCaseId == null) return
    const idStr = String(initialCaseId)
    startTransition(() => {
      setCaseIdInput(idStr)
    })
    void loadEvidenceForCaseId(idStr)
  }, [initialCaseId, loadEvidenceForCaseId])

  const fetchEvidence = useCallback(async () => {
    await loadEvidenceForCaseId(caseIdInput)
  }, [caseIdInput, loadEvidenceForCaseId])

  const download = useCallback(() => {
    if (!evidenceJson) return
    const id = Number(caseIdInput)
    if (!Number.isFinite(id)) return
    const blob = new Blob([evidenceJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `case-${id}-evidence.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [caseIdInput, evidenceJson])

  const loadedCaseId = evidence?.case_id

  return (
    <>
      <header className="mb-xxl">
        <h1 className="mb-base text-3xl font-semibold tracking-tight text-on-background sm:text-4xl">Audit evidence</h1>
        <p className="max-w-2xl text-base text-on-surface-variant">
          Requires API settings <code className="rounded bg-surface-container px-xs py-xxs text-sm">allow_evidence_export</code> and a
          non–memory-only storage mode; otherwise you will see 403.
        </p>
      </header>

      <section className="mb-lg flex flex-wrap items-end gap-md rounded-xl border border-hairline bg-canvas p-lg shadow-sm">
        <label className="flex flex-col gap-xxs text-xs font-semibold uppercase tracking-wide text-outline">
          Case id
          <input
            type="number"
            min={1}
            value={caseIdInput}
            onChange={(e) => setCaseIdInput(e.target.value)}
            className="w-28 rounded-xl border border-hairline-strong bg-surface-soft px-sm py-sm text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary"
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void fetchEvidence()}
          className="rounded-xl border border-primary bg-primary px-lg py-sm text-sm font-medium text-on-primary hover:bg-primary-container disabled:opacity-45"
        >
          {loading ? 'Loading…' : 'Load evidence'}
        </button>
        <button
          type="button"
          disabled={!evidenceJson || loading}
          onClick={download}
          className="rounded-xl border border-hairline-strong bg-surface-soft px-lg py-sm text-sm font-medium text-on-surface hover:bg-surface-container-low disabled:opacity-45"
        >
          Download JSON
        </button>
      </section>

      {error ? (
        <div className="mb-lg rounded-xl border border-error-container bg-error-container/30 px-lg py-md text-sm text-error">
          {error}
        </div>
      ) : null}

      {evidence ? (
        <div className="flex flex-col gap-lg">
          <section className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-md border-b border-hairline bg-surface px-lg py-md">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-outline">Case information</h2>
              {loadedCaseId != null ? (
                <button
                  type="button"
                  disabled={workspaceDisabled}
                  title={
                    workspaceDisabled
                      ? 'Review in workspace requires a tablet or desktop (wider screen).'
                      : undefined
                  }
                  onClick={() => onOpenWorkspace(loadedCaseId)}
                  className="inline-flex items-center gap-xs rounded-xl border border-primary bg-primary px-lg py-sm text-sm font-medium text-on-primary hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  Review in workspace
                </button>
              ) : null}
            </div>
            <CaseLifecycleBanner evidence={evidence} />
            <div className="flex flex-col gap-md p-lg">
              <div className="grid gap-md grid-cols-1 lg:grid-cols-12">
                <div className="rounded-xl border border-hairline bg-surface-soft p-md lg:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-outline">Case ID</p>
                  <p className="mt-xs text-lg font-semibold text-on-background">{evidence.case_id}</p>
                </div>
                <div className="rounded-xl border border-hairline bg-surface-soft p-md lg:col-span-10">
                  <p className="text-xs font-semibold uppercase tracking-wide text-outline">External reference</p>
                  <p className="mt-xs break-all text-sm font-medium text-on-surface">
                    {evidence.external_ref?.trim() ? evidence.external_ref : '—'}
                  </p>
                </div>
              </div>
              <div className="grid gap-md grid-cols-2 md:grid-cols-6 lg:grid-cols-12">
                <div className="rounded-xl border border-hairline bg-surface-soft p-md md:col-span-1 lg:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-outline">Source files</p>
                  <p className="mt-xs text-lg font-semibold text-on-background">{evidence.input_references.length}</p>
                </div>
                <div className="rounded-xl border border-hairline bg-surface-soft p-md md:col-span-1 lg:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-outline">Segments (total)</p>
                  <p className="mt-xs text-lg font-semibold text-on-background">{evidence.segments.length}</p>
                </div>
                <div className="col-span-2 rounded-xl border border-hairline bg-surface-soft p-md md:col-span-2 lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-outline">Latest document file</p>
                  <p
                    className="mt-xs truncate text-sm font-medium text-on-surface"
                    title={evidence.latest_document_original_filename ?? undefined}
                  >
                    {evidence.latest_document_original_filename?.trim() ? evidence.latest_document_original_filename : '—'}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-hairline bg-surface-soft p-md md:col-span-2 lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-outline">Document type</p>
                  <div className="mt-xs flex flex-wrap items-start gap-sm">
                    <DocumentTypeIcon
                      contentType={evidence.latest_document_content_type}
                      filename={evidence.latest_document_original_filename}
                      sizeClass="text-[26px]"
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-on-surface">
                        {documentTypeLabel(evidence.latest_document_content_type, evidence.latest_document_original_filename)}
                      </p>
                      {evidence.latest_document_content_type ? (
                        <p
                          className="mt-xxs truncate font-mono text-xs text-on-surface-variant"
                          title={evidence.latest_document_content_type}
                        >
                          {evidence.latest_document_content_type}
                        </p>
                      ) : (
                        <p className="mt-xxs text-xs text-on-surface-variant">MIME type not recorded</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-hairline pt-lg">
                <p className="mb-sm text-xs font-semibold uppercase tracking-wide text-outline">Translation (latest document)</p>
                <p className="mb-md text-sm text-on-surface-variant">
                  Source and target from the most recently uploaded file, after OCR detects the primary language when source is set to
                  automatic.
                </p>
                {translationTags == null ? (
                  <p className="text-sm text-on-surface-variant">No process languages recorded yet (upload and run translation).</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-sm">
                    <span className={`rounded-full px-md py-xxs text-xs font-bold ${translationTags.from.className}`}>
                      {translationTags.from.label}
                    </span>
                    <span className="material-symbols-outlined text-lg text-outline" aria-hidden>
                      arrow_forward
                    </span>
                    <span className={`rounded-full px-md py-xxs text-xs font-bold ${translationTags.to.className}`}>
                      {translationTags.to.label}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-hairline pt-lg">
                <p className="mb-sm text-xs font-semibold uppercase tracking-wide text-outline">Segment review</p>
                <p className="mb-md text-sm text-on-surface-variant">
                  Counts reflect every segment in this export (all documents on the case). Pending means still in automatic review.
                </p>
                <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-hairline bg-tint-mint/25 p-md">
                    <p className="text-xs font-semibold uppercase tracking-wide text-outline">Approved</p>
                    <p className="mt-xs text-2xl font-semibold text-brand-green">{evidence.segment_counts.approved}</p>
                  </div>
                  <div className="rounded-xl border border-hairline bg-error-container/20 p-md">
                    <p className="text-xs font-semibold uppercase tracking-wide text-outline">Rejected</p>
                    <p className="mt-xs text-2xl font-semibold text-error">{evidence.segment_counts.rejected}</p>
                  </div>
                  <div className="rounded-xl border border-hairline bg-tint-amber/30 p-md">
                    <p className="text-xs font-semibold uppercase tracking-wide text-outline">Pending</p>
                    <p className="mt-xs text-2xl font-semibold text-on-background">{evidence.segment_counts.pending}</p>
                    <p className="mt-xxs text-xs text-on-surface-variant">Awaiting review</p>
                  </div>
                  <div className="rounded-xl border border-hairline bg-tint-lavender/40 p-md">
                    <p className="text-xs font-semibold uppercase tracking-wide text-outline">Edited</p>
                    <p className="mt-xs text-2xl font-semibold text-primary">{evidence.segment_counts.edited}</p>
                    <p className="mt-xxs text-xs text-on-surface-variant">Saved with changes</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-sm">
            <div className="border-b border-hairline bg-surface px-lg py-md">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-outline">Audit log</h2>
              <p className="mt-xs max-w-2xl text-sm text-on-surface-variant">
                Chronological record of actions on this case ({evidence.audit_trail.length} event
                {evidence.audit_trail.length === 1 ? '' : 's'}).
              </p>
            </div>
            <div className="overflow-x-auto">
              {evidence.audit_trail.length === 0 ? (
                <p className="px-lg py-xl text-center text-sm text-on-surface-variant">No audit events recorded for this case yet.</p>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-soft">
                      <th className="w-12 px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">#</th>
                      <th className="px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">Actor</th>
                      <th className="min-w-[10rem] px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">Action</th>
                      <th className="px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {evidence.audit_trail.map((row, i) => (
                      <tr key={i} className="align-top transition-colors hover:bg-surface-container-low">
                        <td className="px-lg py-md text-sm text-on-surface-variant">{i + 1}</td>
                        <td className="px-lg py-md text-sm font-medium text-on-surface">{row.actor}</td>
                        <td className="px-lg py-md">
                          <code className="rounded-md bg-surface-container px-sm py-xxs text-xs text-on-surface">{row.action}</code>
                        </td>
                        <td className="max-w-xl px-lg py-md">
                          <div className="max-h-48 overflow-y-auto rounded-lg border border-hairline bg-surface-soft p-sm">
                            <AuditDetailsContent action={row.action} details={row.details} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {evidenceJson ? (
            <details className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-sm">
              <summary className="cursor-pointer list-none border-b border-hairline bg-surface px-lg py-md text-sm font-medium text-on-surface hover:bg-surface-container-low [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-sm">
                  <span className="material-symbols-outlined text-lg text-outline">code</span>
                  Full export JSON
                  <span className="text-xs font-normal text-on-surface-variant">— raw payload</span>
                </span>
              </summary>
              <pre className="max-h-[min(70vh,720px)] overflow-auto p-lg text-xs leading-relaxed text-on-surface">{evidenceJson}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
