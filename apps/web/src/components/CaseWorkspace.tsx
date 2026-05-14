import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { ViewerResponse, ViewerSegment } from '../api/types'
import { createCase, deleteCase, unarchiveCase } from '../api/cases'
import { fetchTranslationLanguages, type TranslationLanguagesResponse } from '../api/translationLanguages'
import { languagePillClass } from '../lib/caseDisplay'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const CASE_NOT_CREATED_COPY =
  'This case does not exist yet. Choose a file below and click Upload & process — if this case id is not in the system, a new case will be created automatically when you upload.'

function isCaseNotFoundBody(body: string): boolean {
  const t = body.trim().toLowerCase()
  if (t.includes('case not found')) return true
  try {
    const j = JSON.parse(body) as { detail?: unknown }
    const d = j.detail
    if (typeof d === 'string') return d.toLowerCase().includes('case not found')
  } catch {
    /* ignore */
  }
  return false
}

function errorMessageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : 'Request failed'
}

function countSegmentReviewStats(segments: { status: string }[]) {
  let approved = 0
  let rejected = 0
  let pending = 0
  let edited = 0
  for (const s of segments) {
    if (s.status === 'approved') approved++
    else if (s.status === 'rejected') rejected++
    else if (s.status === 'auto') pending++
    else if (s.status === 'edited') edited++
  }
  return { approved, rejected, pending, edited }
}

/** Latest-document viewer scope: archived when there are segments and none are still `auto`. */
function viewerSegmentReviewComplete(v: ViewerResponse): boolean {
  return v.segments.length > 0 && v.segments.every((s) => s.status !== 'auto')
}

/** Next `auto` segment after `selectedId` in document order; wraps to the first pending. */
function findNextPendingSegment(segments: ViewerSegment[], selectedId: string | null): ViewerSegment | null {
  const pending = segments.filter((s) => s.status === 'auto')
  if (pending.length === 0) return null
  if (selectedId == null) return pending[0]
  const cur = segments.findIndex((s) => s.segment_id === selectedId)
  for (let i = cur + 1; i < segments.length; i++) {
    if (segments[i].status === 'auto') return segments[i]
  }
  return pending[0]
}

async function fetchViewer(caseId: number): Promise<ViewerResponse> {
  const r = await fetch(`/cases/${caseId}/viewer`)
  if (!r.ok) {
    const body = await r.text()
    throw new Error(body)
  }
  return r.json() as Promise<ViewerResponse>
}

async function postReview(caseId: number, segmentId: string, action: 'approve' | 'reject'): Promise<void> {
  const r = await fetch(`/cases/${caseId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segment_id: segmentId, action }),
  })
  if (!r.ok) throw new Error(await r.text())
}

async function postReviewBulk(caseId: number, action: 'approve' | 'reject'): Promise<void> {
  const r = await fetch(`/cases/${caseId}/review-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!r.ok) throw new Error(await r.text())
}

async function uploadDocument(caseId: number, file: File): Promise<{ id: number }> {
  const body = new FormData()
  body.append('file', file, file.name)
  const r = await fetch(`/cases/${caseId}/documents`, { method: 'POST', body })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(text)
  }
  return r.json() as Promise<{ id: number }>
}

async function runProcess(
  caseId: number,
  documentId: number,
  langs: { source_language: string; target_language: string },
): Promise<void> {
  const r = await fetch(`/cases/${caseId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_id: documentId,
      source_language: langs.source_language,
      target_language: langs.target_language,
    }),
  })
  if (!r.ok) throw new Error(await r.text())
}

export type CaseWorkspaceProps = {
  initialCaseId?: number | null
  openFilePickerSignal?: number
  /** Called after the hidden file input is triggered from `openFilePickerSignal` so the parent can clear the signal (avoids reopening the picker when returning to Workspace). */
  onOpenFilePickerSignalConsumed?: () => void
  onCasesChanged?: () => void
  /** Called after a successful delete (e.g. navigate back to the dashboard). */
  onCaseDeleted?: () => void
}

export default function CaseWorkspace({
  initialCaseId = null,
  openFilePickerSignal = 0,
  onOpenFilePickerSignalConsumed,
  onCasesChanged,
  onCaseDeleted,
}: CaseWorkspaceProps) {
  const [caseIdInput, setCaseIdInput] = useState(() =>
    initialCaseId != null && Number.isFinite(initialCaseId) ? String(initialCaseId) : '1',
  )
  const [debouncedCaseIdInput, setDebouncedCaseIdInput] = useState(caseIdInput)
  const [caseId, setCaseId] = useState<number | null>(null)
  const [data, setData] = useState<ViewerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [caseArchivedNotice, setCaseArchivedNotice] = useState<string | null>(null)
  const [viewerIdleMessage, setViewerIdleMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [translationLangs, setTranslationLangs] = useState<TranslationLanguagesResponse | null>(null)
  const [translationLangsError, setTranslationLangsError] = useState<string | null>(null)
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguage, setTargetLanguage] = useState('en')
  const fileRef = useRef<HTMLInputElement>(null)
  const extractedSegmentRefs = useRef(new Map<string, HTMLButtonElement>())
  const translatedSegmentRefs = useRef(new Map<string, HTMLButtonElement>())
  const dataCaseIdRef = useRef<number | null>(null)

  useEffect(() => {
    dataCaseIdRef.current = data?.case_id ?? null
  }, [data?.case_id])

  useLayoutEffect(() => {
    if (selected == null) return
    const id = selected
    const ex = extractedSegmentRefs.current.get(id)
    const tr = translatedSegmentRefs.current.get(id)
    const opts: ScrollIntoViewOptions = { block: 'center', inline: 'nearest', behavior: 'smooth' }
    ex?.scrollIntoView(opts)
    tr?.scrollIntoView(opts)
  }, [selected, data?.case_id, page])

  useEffect(() => {
    if (initialCaseId == null || !Number.isFinite(initialCaseId)) return
    const s = String(initialCaseId)
    startTransition(() => {
      setCaseIdInput(s)
      setDebouncedCaseIdInput(s)
    })
  }, [initialCaseId])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedCaseIdInput(caseIdInput), 350)
    return () => window.clearTimeout(t)
  }, [caseIdInput])

  const loadViewerForCaseId = useCallback(async (id: number, opts?: { cancelled?: () => boolean }): Promise<boolean> => {
    setError(null)
    setViewerIdleMessage(null)
    setCaseArchivedNotice(null)
    try {
      const v = await fetchViewer(id)
      if (opts?.cancelled?.()) return false
      setCaseId(id)
      setData(v)
      setSelected(v.segments[0]?.segment_id ?? null)
      setPage(1)
      return true
    } catch (e) {
      if (opts?.cancelled?.()) return false
      setData(null)
      setCaseId(null)
      const raw = errorMessageFromUnknown(e)
      if (isCaseNotFoundBody(raw)) {
        setError(null)
        setViewerIdleMessage(CASE_NOT_CREATED_COPY)
        return false
      }
      setViewerIdleMessage(null)
      setError(raw.length > 400 ? `${raw.slice(0, 400)}…` : raw)
      return false
    }
  }, [])

  useEffect(() => {
    const id = Number(debouncedCaseIdInput)
    if (!Number.isFinite(id) || id < 1) return
    if (dataCaseIdRef.current === id) return
    let cancelled = false
    void loadViewerForCaseId(id, { cancelled: () => cancelled })
    return () => {
      cancelled = true
    }
  }, [debouncedCaseIdInput, loadViewerForCaseId])

  useEffect(() => {
    if (openFilePickerSignal <= 0) return
    const processedForInitial =
      initialCaseId != null &&
      data != null &&
      data.case_id === initialCaseId &&
      data.segments.length > 0
    if (processedForInitial) {
      onOpenFilePickerSignalConsumed?.()
      return
    }
    const archivedReadOnly =
      data != null && data.segments.length > 0 && data.segments.every((s) => s.status !== 'auto')
    if (archivedReadOnly) {
      onOpenFilePickerSignalConsumed?.()
      return
    }
    queueMicrotask(() => {
      fileRef.current?.click()
      onOpenFilePickerSignalConsumed?.()
    })
  }, [openFilePickerSignal, onOpenFilePickerSignalConsumed, data, initialCaseId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cfg = await fetchTranslationLanguages()
        if (cancelled) return
        setTranslationLangs(cfg)
        setTranslationLangsError(null)
        setSourceLanguage((prev) => (cfg.sources.some((s) => s.code === prev) ? prev : cfg.sources[0]?.code ?? 'auto'))
        setTargetLanguage((prev) => (cfg.targets.some((s) => s.code === prev) ? prev : cfg.targets[0]?.code ?? 'en'))
      } catch (e) {
        if (!cancelled) {
          setTranslationLangs(null)
          setTranslationLangsError(e instanceof Error ? e.message : 'Could not load language options')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const parsedCaseId = useMemo(() => {
    const id = Number(caseIdInput)
    return Number.isFinite(id) && id >= 1 ? id : null
  }, [caseIdInput])

  const onNewCase = useCallback(async () => {
    setError(null)
    setViewerIdleMessage(null)
    setCaseArchivedNotice(null)
    setBusy(true)
    try {
      const c = await createCase()
      const sid = String(c.id)
      setCaseIdInput(sid)
      setDebouncedCaseIdInput(sid)
      setData(null)
      setCaseId(null)
      setSelected(null)
      onCasesChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create case')
    } finally {
      setBusy(false)
    }
  }, [onCasesChanged])

  const onUploadAndProcess = useCallback(async () => {
    if (parsedCaseId == null) {
      setError('Enter a valid case id')
      return
    }
    const archived =
      data != null &&
      data.segments.length > 0 &&
      data.segments.every((s) => s.status !== 'auto') &&
      data.case_id === parsedCaseId
    if (archived) {
      setError('This case is archived. Unarchive before uploading or processing.')
      return
    }
    const alreadyProcessed =
      data != null && data.case_id === parsedCaseId && data.segments.length > 0
    if (alreadyProcessed) {
      setError('This case already has a processed document. Use New case to upload another file.')
      return
    }
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Choose a PDF, PNG, or JPEG file first')
      return
    }
    setError(null)
    setBusy(true)
    try {
      let targetCaseId = parsedCaseId
      let docId: number
      try {
        const up = await uploadDocument(targetCaseId, file)
        docId = up.id
      } catch (first) {
        const raw = errorMessageFromUnknown(first)
        if (!isCaseNotFoundBody(raw)) {
          setError(raw.length > 400 ? `${raw.slice(0, 400)}…` : raw)
          return
        }
        const c = await createCase()
        targetCaseId = c.id
        const sid = String(c.id)
        setCaseIdInput(sid)
        setDebouncedCaseIdInput(sid)
        onCasesChanged?.()
        const up = await uploadDocument(targetCaseId, file)
        docId = up.id
      }
      await runProcess(targetCaseId, docId, {
        source_language: sourceLanguage,
        target_language: targetLanguage,
      })
      const v = await fetchViewer(targetCaseId)
      setCaseId(targetCaseId)
      setData(v)
      setSelected(v.segments[0]?.segment_id ?? null)
      setPage(1)
      setViewerIdleMessage(null)
      setCaseArchivedNotice(null)
      if (fileRef.current) fileRef.current.value = ''
      onCasesChanged?.()
    } catch (e) {
      const msg = errorMessageFromUnknown(e)
      setError(msg.length > 400 ? `${msg.slice(0, 400)}…` : msg)
    } finally {
      setBusy(false)
    }
  }, [parsedCaseId, onCasesChanged, sourceLanguage, targetLanguage, data])

  const originalFileUrl = useMemo(() => {
    if (!data?.original_file_url) return null
    return data.original_file_url
  }, [data])

  const originalIsPdf = data?.content_type === 'application/pdf'
  const originalIsImage =
    data?.content_type === 'image/png' ||
    data?.content_type === 'image/jpeg' ||
    data?.content_type === 'image/jpg'

  const onSelect = useCallback((seg: ViewerSegment) => {
    setSelected(seg.segment_id)
    setPage(seg.page_number)
  }, [])

  const segmentReviewStats = useMemo(() => {
    if (data == null || data.segments.length === 0) return null
    return countSegmentReviewStats(data.segments)
  }, [data])

  const documentProcessPills = useMemo(() => {
    if (data == null || data.source_language == null || data.target_language == null) return null
    const from = languagePillClass(data.source_language === 'auto' ? data.resolved_source_language : data.source_language)
    const to = languagePillClass(data.target_language)
    return { from, to, isAuto: data.source_language === 'auto' }
  }, [data])

  const goToNextPending = useCallback(() => {
    if (data == null) return
    const next = findNextPendingSegment(data.segments, selected)
    if (next != null) onSelect(next)
  }, [data, selected, onSelect])

  useEffect(() => {
    if (data == null) return
    if (selected == null) return
    const seg = data.segments.find((s) => s.segment_id === selected)
    if (seg && seg.page_number === page) return
    const firstOnPage = data.segments.find((s) => s.page_number === page)
    setSelected(firstOnPage?.segment_id ?? null)
  }, [page, data, selected])

  const lowConfidence = (c: number) => c < 0.55

  const activeCaseId = data?.case_id ?? caseId

  const segmentReviewComplete =
    data != null && data.segments.length > 0 && data.segments.every((s) => s.status !== 'auto')

  const workspaceLocked = segmentReviewComplete

  const documentUploadLocked = useMemo(() => {
    if (parsedCaseId == null || data == null) return false
    if (data.case_id !== parsedCaseId) return false
    return data.segments.length > 0
  }, [parsedCaseId, data])

  const canDeleteCase =
    activeCaseId != null && data != null && data.case_id === activeCaseId && !segmentReviewComplete

  const canUnarchiveCase =
    activeCaseId != null && data != null && data.case_id === activeCaseId && segmentReviewComplete

  const runReview = useCallback(
    async (action: 'approve' | 'reject') => {
      const cid = activeCaseId
      const seg = selected
      if (cid == null || seg == null) {
        setError('Select a segment in the lists below first')
        return
      }
      if (
        data != null &&
        data.segments.length > 0 &&
        data.segments.every((s) => s.status !== 'auto')
      ) {
        setError('This case is archived. Unarchive before changing reviews.')
        return
      }
      setError(null)
      setBusy(true)
      try {
        await postReview(cid, seg, action)
        const v = await fetchViewer(cid)
        setData(v)
        setCaseId(cid)
        setSelected(seg)
        if (viewerSegmentReviewComplete(v)) {
          setCaseArchivedNotice(
            'This case has been archived — every segment on this document is approved, rejected, or edited.',
          )
        }
        onCasesChanged?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Review request failed')
      } finally {
        setBusy(false)
      }
    },
    [activeCaseId, selected, onCasesChanged, data],
  )

  const runReviewBulk = useCallback(
    async (action: 'approve' | 'reject') => {
      const cid = activeCaseId
      if (cid == null || !data?.segments.length) {
        setError('Load a case with segments first')
        return
      }
      if (data.segments.length > 0 && data.segments.every((s) => s.status !== 'auto')) {
        setError('This case is archived. Unarchive before changing reviews.')
        return
      }
      setError(null)
      setBusy(true)
      try {
        await postReviewBulk(cid, action)
        const v = await fetchViewer(cid)
        setData(v)
        setCaseId(cid)
        setSelected((prev) => (prev && v.segments.some((s) => s.segment_id === prev) ? prev : v.segments[0]?.segment_id ?? null))
        if (viewerSegmentReviewComplete(v)) {
          setCaseArchivedNotice(
            'This case has been archived — every segment on this document is approved, rejected, or edited.',
          )
        }
        onCasesChanged?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Bulk review request failed')
      } finally {
        setBusy(false)
      }
    },
    [activeCaseId, data, onCasesChanged],
  )

  const onDeleteCase = useCallback(async () => {
    const cid = activeCaseId
    if (cid == null || data == null) return
    if (
      !window.confirm(
        'Delete this case and all uploaded documents? You cannot do this after every segment is reviewed (archived).',
      )
    ) {
      return
    }
    setError(null)
    setViewerIdleMessage(null)
    setCaseArchivedNotice(null)
    setBusy(true)
    try {
      await deleteCase(cid)
      onCasesChanged?.()
      setCaseIdInput('1')
      setDebouncedCaseIdInput('1')
      setData(null)
      setCaseId(null)
      setSelected(null)
      setNumPages(0)
      setPage(1)
      onCaseDeleted?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }, [activeCaseId, data, onCasesChanged, onCaseDeleted])

  const onUnarchiveCase = useCallback(async () => {
    const cid = activeCaseId
    if (cid == null || data == null) return
    if (
      !window.confirm(
        'Return every segment on this document to pending automatic review? You can approve, reject, or edit again. Document upload remains disabled for this case.',
      )
    ) {
      return
    }
    setError(null)
    setViewerIdleMessage(null)
    setCaseArchivedNotice(null)
    setBusy(true)
    try {
      await unarchiveCase(cid)
      const v = await fetchViewer(cid)
      setData(v)
      setCaseId(cid)
      setSelected(v.segments[0]?.segment_id ?? null)
      setCaseArchivedNotice(null)
      onCasesChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unarchive failed')
    } finally {
      setBusy(false)
    }
  }, [activeCaseId, data, onCasesChanged])

  const btnPrimary =
    'rounded-xl border border-primary bg-primary px-md py-sm text-sm font-medium text-on-primary transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-45'
  const btnSecondary =
    'rounded-xl border border-hairline-strong bg-canvas px-md py-sm text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-45'
  const inputClass =
    'rounded-xl border border-hairline-strong bg-canvas px-sm py-sm text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary'

  return (
    <div className="rounded-xl border border-hairline bg-canvas p-lg shadow-sm">
      <div className="mb-lg flex flex-col gap-md">
        {workspaceLocked ? (
          <div className="flex flex-col gap-xs">
            {caseArchivedNotice ? (
              <p
                className="rounded-xl border border-primary/40 bg-tint-lavender px-md py-sm text-sm font-semibold text-primary"
                role="status"
              >
                {caseArchivedNotice}
              </p>
            ) : null}
            <p className="rounded-xl border border-hairline bg-surface-soft px-md py-sm text-sm text-on-surface-variant">
              This case is archived (all segments reviewed). Language choices and review actions are disabled until you
              unarchive. Document upload stays off once a case has been processed.
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-sm md:gap-md">
          <label className="flex flex-col gap-xxs text-xs font-semibold uppercase tracking-wide text-outline">
            Case id
            <input
              value={caseIdInput}
              onChange={(e) => setCaseIdInput(e.target.value)}
              type="number"
              min={1}
              className={`${inputClass} w-24`}
            />
          </label>
          <button type="button" disabled={busy} className={btnSecondary} onClick={() => void onNewCase()}>
            New case
          </button>
          {canDeleteCase ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-xl border border-error-container bg-canvas px-md py-sm text-sm font-medium text-error transition-colors hover:bg-error-container/30 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => void onDeleteCase()}
            >
              Delete case
            </button>
          ) : canUnarchiveCase ? (
            <button
              type="button"
              disabled={busy}
              className={btnSecondary}
              onClick={() => void onUnarchiveCase()}
            >
              Unarchive
            </button>
          ) : null}
        </div>
        {translationLangsError ? (
          <p className="text-sm text-error">Could not load translation languages: {translationLangsError}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-sm md:gap-md">
          <label className="flex flex-col gap-xxs text-xs font-semibold uppercase tracking-wide text-outline">
            Source language
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              disabled={busy || translationLangs == null || workspaceLocked}
              className={`${inputClass} min-w-[10rem]`}
            >
              {(translationLangs?.sources ?? []).map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xxs text-xs font-semibold uppercase tracking-wide text-outline">
            Target language
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              disabled={busy || translationLangs == null || workspaceLocked}
              className={`${inputClass} min-w-[10rem]`}
            >
              {(translationLangs?.targets ?? []).map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {documentProcessPills != null ? (
          <div className="flex flex-wrap items-center gap-sm rounded-xl border border-hairline bg-surface-soft px-md py-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-outline">Processed as</span>
            <div className="flex flex-wrap items-center gap-xs">
              <span
                className={`inline-flex items-center rounded-full px-sm py-xxs text-xs font-semibold ${documentProcessPills.from.className}`}
                title={documentProcessPills.isAuto ? 'Source (auto-detected)' : 'Source language'}
              >
                {documentProcessPills.from.label}
              </span>
              <span className="text-xs font-medium text-outline" aria-hidden>
                →
              </span>
              <span
                className={`inline-flex items-center rounded-full px-sm py-xxs text-xs font-semibold ${documentProcessPills.to.className}`}
                title="Target language"
              >
                {documentProcessPills.to.label}
              </span>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-sm md:gap-md">
          <label className="flex min-w-0 w-full max-w-xl flex-col gap-xxs text-xs font-semibold uppercase tracking-wide text-outline sm:min-w-[12rem]">
            Document
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf,image/png,image/jpeg"
              disabled={busy || workspaceLocked || documentUploadLocked}
              className="w-full min-w-0 text-sm text-on-surface-variant file:mr-sm file:rounded-lg file:border-0 file:bg-primary-fixed file:px-sm file:py-xxs file:text-sm file:font-medium file:text-on-primary-fixed disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            disabled={
              busy ||
              parsedCaseId == null ||
              translationLangs == null ||
              translationLangsError != null ||
              workspaceLocked ||
              documentUploadLocked
            }
            className={`${btnPrimary} shrink-0`}
            onClick={() => void onUploadAndProcess()}
          >
            Upload &amp; process
          </button>
        </div>
        {documentUploadLocked && !workspaceLocked ? (
          <p className="text-sm text-on-surface-variant">
            Document upload is disabled for this case after processing. Use <span className="font-medium text-on-surface">New case</span>{' '}
            if you need another file.
          </p>
        ) : null}
        {activeCaseId != null && data != null && data.segments.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-sm border-t border-hairline pt-md md:gap-md">
            <span className="w-full text-xs font-semibold uppercase tracking-wide text-outline sm:w-auto">Segment actions</span>
            <button type="button" disabled={busy || workspaceLocked || selected == null} className={btnSecondary} onClick={() => void runReview('approve')}>
              Approve segment
            </button>
            <button type="button" disabled={busy || workspaceLocked || selected == null} className={btnSecondary} onClick={() => void runReview('reject')}>
              Reject segment
            </button>
            <button
              type="button"
              disabled={busy || workspaceLocked}
              className={`${btnPrimary} ms-auto shrink-0`}
              onClick={() => void runReviewBulk('approve')}
            >
              Approve all segments
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="mb-md text-sm text-error">{error}</p> : null}
      {data ? (
        <>
          {segmentReviewStats != null ? (
            <div className="mb-md flex flex-wrap items-center justify-between gap-md rounded-xl border border-hairline bg-surface-soft px-md py-sm">
              <div className="flex flex-wrap items-center gap-x-md gap-y-xs text-sm">
                <span className="text-on-surface">
                  <span className="font-semibold">Approved</span>{' '}
                  <span className="tabular-nums text-on-surface-variant">{segmentReviewStats.approved}</span>
                </span>
                <span className="text-outline" aria-hidden>
                  ·
                </span>
                <span className="text-on-surface">
                  <span className="font-semibold">Rejected</span>{' '}
                  <span className="tabular-nums text-on-surface-variant">{segmentReviewStats.rejected}</span>
                </span>
                <span className="text-outline" aria-hidden>
                  ·
                </span>
                <span className="text-on-surface">
                  <span className="font-semibold">Pending</span>{' '}
                  <span className="tabular-nums text-on-surface-variant">{segmentReviewStats.pending}</span>
                </span>
                {segmentReviewStats.edited > 0 ? (
                  <>
                    <span className="text-outline" aria-hidden>
                      ·
                    </span>
                    <span className="text-on-surface">
                      <span className="font-semibold">Edited</span>{' '}
                      <span className="tabular-nums text-on-surface-variant">{segmentReviewStats.edited}</span>
                    </span>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                disabled={busy || segmentReviewStats.pending === 0 || workspaceLocked}
                className={btnSecondary}
                onClick={goToNextPending}
              >
                Next pending segment
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-md lg:grid-cols-3">
          <section className="min-h-[200px] overflow-auto rounded-xl border border-hairline bg-surface-soft p-md lg:min-h-[320px]">
            <h2 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">Original</h2>
            {originalFileUrl ? (
              originalIsImage ? (
                <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-canvas p-sm">
                  <img
                    src={originalFileUrl}
                    alt="Original uploaded image"
                    className="mx-auto max-h-[65vh] w-auto max-w-full object-contain"
                  />
                </div>
              ) : originalIsPdf ? (
                <>
                  <div className="mb-sm flex flex-wrap items-center gap-sm text-sm text-on-surface-variant">
                    <button
                      type="button"
                      disabled={page <= 1}
                      className={btnSecondary}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Prev
                    </button>
                    <span>
                      Page {page} / {numPages || '…'}
                    </span>
                    <button
                      type="button"
                      disabled={numPages > 0 && page >= numPages}
                      className={btnSecondary}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                  <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-canvas p-sm">
                    <Document file={originalFileUrl} onLoadSuccess={(d) => setNumPages(d.numPages)}>
                      <Page pageNumber={page} width={360} />
                    </Document>
                  </div>
                </>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  Preview is not available for this file type.{' '}
                  <a
                    href={originalFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Open original file
                  </a>
                </p>
              )
            ) : (
              <p className="text-sm text-on-surface-variant">No document on this case.</p>
            )}
          </section>
          <section className="min-h-[200px] rounded-xl border border-hairline bg-surface-soft p-md lg:min-h-[320px]">
            <h2 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">
              Extracted · full document
            </h2>
            <ul className="m-0 max-h-[70vh] list-none space-y-xs overflow-auto p-0">
              {data.segments.length === 0 ? (
                <li className="text-sm text-on-surface-variant">No segments on this case.</li>
              ) : (
                data.segments.map((s) => (
                <li key={s.segment_id}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) extractedSegmentRefs.current.set(s.segment_id, el)
                      else extractedSegmentRefs.current.delete(s.segment_id)
                    }}
                    className={`scroll-mt-2 scroll-mb-2 block w-full rounded-lg border px-sm py-sm text-left transition-colors ${
                      selected === s.segment_id
                        ? 'border-primary bg-tint-lavender shadow-[0_0_0_1px_rgba(86,37,168,0.35)]'
                        : 'border-hairline bg-canvas hover:border-hairline-strong'
                    }`}
                    onClick={() => onSelect(s)}
                  >
                    <span className="mb-xxs block text-[11px] font-semibold uppercase tracking-wide text-outline">
                      p{s.page_number}
                      {s.status !== 'auto' ? (
                        <span className="ml-xs font-semibold normal-case text-primary">· {s.status}</span>
                      ) : null}
                      {lowConfidence(s.confidence) ? (
                        <span className="ml-xs text-brand-orange">Low confidence</span>
                      ) : null}
                    </span>
                    <span className="whitespace-pre-wrap text-sm text-on-surface">{s.extracted_text}</span>
                  </button>
                </li>
              ))
              )}
            </ul>
          </section>
          <section className="min-h-[200px] rounded-xl border border-hairline bg-surface-soft p-md lg:min-h-[320px]">
            <h2 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">
              Translated · full document
            </h2>
            <ul className="m-0 max-h-[70vh] list-none space-y-xs overflow-auto p-0">
              {data.segments.length === 0 ? (
                <li className="text-sm text-on-surface-variant">No segments on this case.</li>
              ) : (
                data.segments.map((s) => (
                <li key={s.segment_id}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) translatedSegmentRefs.current.set(s.segment_id, el)
                      else translatedSegmentRefs.current.delete(s.segment_id)
                    }}
                    className={`scroll-mt-2 scroll-mb-2 block w-full rounded-lg border px-sm py-sm text-left transition-colors ${
                      selected === s.segment_id
                        ? 'border-primary bg-tint-lavender shadow-[0_0_0_1px_rgba(86,37,168,0.35)]'
                        : 'border-hairline bg-canvas hover:border-hairline-strong'
                    }`}
                    onClick={() => onSelect(s)}
                  >
                    <span className="mb-xxs block text-[11px] font-semibold uppercase tracking-wide text-outline">
                      p{s.page_number}
                      {s.status !== 'auto' ? (
                        <span className="ml-xs font-semibold normal-case text-primary">· {s.status}</span>
                      ) : null}
                    </span>
                    <span className="whitespace-pre-wrap text-sm text-on-surface">{s.translated_text}</span>
                  </button>
                </li>
              ))
              )}
            </ul>
          </section>
        </div>
        </>
      ) : viewerIdleMessage ? (
        <p className="text-sm text-on-surface-variant">{viewerIdleMessage}</p>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Enter a case id to open its viewer when it exists, or use New case / upload to add a document.
        </p>
      )}
    </div>
  )
}
