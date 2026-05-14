import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PageProps } from 'react-pdf'
import type { ViewerResponse, ViewerSegment } from '../api/types'
import { createCase, deleteCase, unarchiveCase } from '../api/cases'
import { fetchTranslationLanguages, type TranslationLanguagesResponse } from '../api/translationLanguages'
import { DocumentTypeIcon } from '../lib/DocumentTypeIcon'
import { confidenceStyle, documentTypeLabel, languagePillClass } from '../lib/caseDisplay'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

type PdfPageRenderInfo = Parameters<NonNullable<PageProps['onRenderSuccess']>>[0]

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const PDF_PAGE_WIDTH = 360

const VIEWER_ZOOM_MIN = 0.5
const VIEWER_ZOOM_MAX = 2.5
const VIEWER_ZOOM_STEP = 0.1

function clampViewerZoom(z: number): number {
  return Math.min(VIEWER_ZOOM_MAX, Math.max(VIEWER_ZOOM_MIN, Math.round(z * 100) / 100))
}

function DocumentViewerZoomBar(props: {
  zoom: number
  onZoomChange: (fn: (prev: number) => number) => void
  buttonClass: string
}) {
  const { zoom, onZoomChange, buttonClass } = props
  const pct = Math.round(zoom * 100)
  return (
    <div
      className="flex flex-wrap items-center gap-xs rounded-lg border border-hairline bg-surface-soft px-sm py-xxs text-sm"
      role="group"
      aria-label="Document zoom"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-outline">Zoom</span>
      <button
        type="button"
        className={buttonClass}
        disabled={zoom <= VIEWER_ZOOM_MIN}
        aria-label="Zoom out"
        onClick={() => onZoomChange((z) => clampViewerZoom(z - VIEWER_ZOOM_STEP))}
      >
        −
      </button>
      <span className="min-w-[3.25rem] text-center tabular-nums text-on-surface">{pct}%</span>
      <button
        type="button"
        className={buttonClass}
        disabled={zoom >= VIEWER_ZOOM_MAX}
        aria-label="Zoom in"
        onClick={() => onZoomChange((z) => clampViewerZoom(z + VIEWER_ZOOM_STEP))}
      >
        +
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={zoom === 1}
        aria-label="Reset zoom to 100%"
        onClick={() => onZoomChange(() => 1)}
      >
        Reset
      </button>
    </div>
  )
}

type SegmentReviewSwitchValue = 'pending' | 'approved' | 'rejected'

function segmentReviewSwitchValue(status: string): SegmentReviewSwitchValue {
  if (status === 'auto') return 'pending'
  if (status === 'rejected') return 'rejected'
  return 'approved'
}

function SegmentReviewIconPending(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function SegmentReviewIconApproved(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function SegmentReviewIconRejected(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function segmentReviewSwitchButtonClass(key: SegmentReviewSwitchValue, isOn: boolean): string {
  if (isOn) {
    if (key === 'pending') return 'bg-gray-500 text-white shadow-sm'
    if (key === 'approved') return 'bg-green-600 text-white shadow-sm'
    return 'bg-error text-on-error shadow-sm'
  }
  if (key === 'pending') return 'bg-transparent text-outline hover:bg-surface-soft'
  if (key === 'approved') return 'bg-transparent text-green-700 hover:bg-green-50'
  return 'bg-transparent text-error hover:bg-error-container'
}

function SegmentReviewSwitch(props: {
  active: SegmentReviewSwitchValue
  disabled: boolean
  onPick: (next: SegmentReviewSwitchValue) => void
}) {
  const { active, disabled, onPick } = props
  const opts: {
    key: SegmentReviewSwitchValue
    label: string
    Icon: (p: { className?: string }) => ReactElement
  }[] = [
    { key: 'pending', label: 'Pending', Icon: SegmentReviewIconPending },
    { key: 'approved', label: 'Approve', Icon: SegmentReviewIconApproved },
    { key: 'rejected', label: 'Reject', Icon: SegmentReviewIconRejected },
  ]
  return (
    <div
      className="flex shrink-0 gap-0 rounded-lg border border-hairline bg-surface-container-low p-xxs"
      role="group"
      aria-label="Segment review"
      onClick={(e) => e.stopPropagation()}
    >
      {opts.map(({ key, label, Icon }) => {
        const isOn = active === key
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            title={label}
            aria-label={label}
            aria-pressed={isOn}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${segmentReviewSwitchButtonClass(
              key,
              isOn,
            )} ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
            onClick={() => onPick(key)}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}

function segmentPageCoordBounds(segments: ViewerSegment[], pageNumber: number): { w: number; h: number } {
  let w = 0
  let h = 0
  for (const s of segments) {
    if (s.page_number !== pageNumber) continue
    const bb = segmentBbox(s)
    if (bb == null) continue
    const [x, y, bw, bh] = bb
    w = Math.max(w, x + bw)
    h = Math.max(h, y + bh)
  }
  return { w: Math.max(w, 1), h: Math.max(h, 1) }
}

function segmentBbox(s: ViewerSegment): [number, number, number, number] | null {
  const b = s.bbox
  if (!Array.isArray(b) || b.length < 4) return null
  const x = Number(b[0])
  const y = Number(b[1])
  const bw = Number(b[2])
  const bh = Number(b[3])
  if (![x, y, bw, bh].every((n) => Number.isFinite(n)) || bw <= 0 || bh <= 0) return null
  return [x, y, bw, bh]
}

/** Translated overlay: light transparent fill by review state (pending = `auto`). */
function translatedOverlaySegmentClass(status: string, isSelected: boolean): string {
  const tone =
    status === 'approved'
      ? 'border-emerald-600/65 bg-emerald-200/90 hover:bg-emerald-200/96'
      : status === 'rejected'
        ? 'border-red-600/65 bg-red-200/90 hover:bg-red-200/96'
        : 'border-amber-500/60 bg-yellow-100/90 hover:bg-yellow-50/96'
  const selected = isSelected ? ' ring-2 ring-primary ring-offset-0' : ''
  return tone + selected
}

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

async function postReview(caseId: number, segmentId: string, action: 'approve' | 'reject' | 'pending'): Promise<void> {
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
  const [nativePageDims, setNativePageDims] = useState<{ w: number; h: number } | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [translationLangs, setTranslationLangs] = useState<TranslationLanguagesResponse | null>(null)
  const [translationLangsError, setTranslationLangsError] = useState<string | null>(null)
  const [segmentReviewBusyId, setSegmentReviewBusyId] = useState<string | null>(null)
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguage, setTargetLanguage] = useState('en')
  const fileRef = useRef<HTMLInputElement>(null)
  const extractedSegmentRefs = useRef(new Map<string, HTMLDivElement>())
  const translatedSegmentRefs = useRef(new Map<string, HTMLDivElement>())
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
    setNativePageDims(null)
  }, [page, data?.case_id, data?.original_file_url])

  useEffect(() => {
    setViewerZoom(1)
  }, [data?.case_id, data?.document_id, data?.original_file_url])

  const onTranslatedPdfPageRendered = useCallback((pcb: PdfPageRenderInfo) => {
    setNativePageDims({ w: pcb.originalWidth, h: pcb.originalHeight })
  }, [])

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

  /** Flat images are always segment page 1; avoid stale PDF `page` hiding overlays. */
  const pageForSegmentLayout = originalIsImage ? 1 : page

  const coordBounds = useMemo(() => {
    if (data == null) return { w: 1, h: 1 }
    const fromSegs = segmentPageCoordBounds(data.segments, pageForSegmentLayout)
    const pl = data.page_layout_rects?.find((p) => p.page_number === pageForSegmentLayout)
    if (pl != null) {
      return {
        w: Math.max(fromSegs.w, pl.width),
        h: Math.max(fromSegs.h, pl.height),
      }
    }
    if (nativePageDims == null) return fromSegs
    return {
      w: Math.max(fromSegs.w, nativePageDims.w),
      h: Math.max(fromSegs.h, nativePageDims.h),
    }
  }, [data, pageForSegmentLayout, nativePageDims])

  const showDualOverlayView =
    data != null &&
    data.segments.length > 0 &&
    originalFileUrl != null &&
    (originalIsPdf || originalIsImage)

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

  useEffect(() => {
    if (data == null) return
    if (originalIsImage && page !== 1) {
      setPage(1)
      return
    }
    if (selected == null) return
    const layoutPage = originalIsImage ? 1 : page
    const seg = data.segments.find((s) => s.segment_id === selected)
    if (seg && seg.page_number === layoutPage) return
    const firstOnPage = data.segments.find((s) => s.page_number === layoutPage)
    setSelected(firstOnPage?.segment_id ?? null)
  }, [page, data, selected, originalIsImage])

  const lowConfidence = (c: number) => c < 0.55

  const pdfViewerWidth = Math.round(PDF_PAGE_WIDTH * viewerZoom)
  const imageViewerZoomStyle: CSSProperties = { zoom: viewerZoom }

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

  const setSegmentReviewStatus = useCallback(
    async (segmentId: string, action: 'approve' | 'reject' | 'pending') => {
      const cid = activeCaseId
      if (cid == null) return
      if (
        data != null &&
        data.segments.length > 0 &&
        data.segments.every((s) => s.status !== 'auto')
      ) {
        setError('This case is archived. Unarchive before changing reviews.')
        return
      }
      setError(null)
      setSegmentReviewBusyId(segmentId)
      try {
        await postReview(cid, segmentId, action)
        const v = await fetchViewer(cid)
        setData(v)
        setCaseId(cid)
        if (action === 'approve' || action === 'reject') {
          const next = findNextPendingSegment(v.segments, segmentId)
          if (next != null) onSelect(next)
          else setSelected(null)
        }
        if (viewerSegmentReviewComplete(v)) {
          setCaseArchivedNotice(
            'This case has been archived — every segment on this document is approved, rejected, or edited.',
          )
        } else {
          setCaseArchivedNotice(null)
        }
        onCasesChanged?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Review request failed')
      } finally {
        setSegmentReviewBusyId(null)
      }
    },
    [activeCaseId, data, onCasesChanged, onSelect],
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
        {data != null &&
        (data.document_id != null || Boolean(data.content_type) || Boolean(data.original_filename?.trim())) ? (
          <div className="flex flex-wrap items-center gap-x-md gap-y-xs rounded-xl border border-hairline bg-surface-soft px-md py-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-outline">Document type</span>
            <span className="flex min-w-0 flex-wrap items-center gap-sm">
              <DocumentTypeIcon
                contentType={data.content_type}
                filename={data.original_filename}
                sizeClass="text-[22px]"
              />
              <span className="text-sm font-medium text-on-surface">
                {documentTypeLabel(data.content_type, data.original_filename)}
              </span>
            </span>
            {data.original_filename?.trim() ? (
              <span
                className="min-w-0 max-w-full truncate text-xs text-on-surface-variant sm:max-w-lg"
                title={data.original_filename}
              >
                {data.original_filename}
              </span>
            ) : null}
            {data.content_type ? (
              <span
                className="max-w-full truncate font-mono text-xs text-on-surface-variant sm:max-w-md"
                title={data.content_type}
              >
                {data.content_type}
              </span>
            ) : null}
          </div>
        ) : null}
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
          <div className="flex w-full flex-wrap items-center justify-between gap-sm border-t border-hairline pt-md md:gap-md">
            <span className="text-xs font-semibold uppercase tracking-wide text-outline">Segment actions</span>
            <button
              type="button"
              disabled={busy || workspaceLocked}
              className={`${btnPrimary} shrink-0`}
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
            <div className="mb-md flex flex-wrap items-center gap-md rounded-xl border border-hairline bg-surface-soft px-md py-sm">
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
            </div>
          ) : null}
          {data.segments.length > 0 ? (
            <details
              open
              className="mb-md rounded-xl border border-hairline bg-surface-soft p-md open:border-hairline-strong"
            >
              <summary className="cursor-pointer select-none text-sm font-semibold text-on-surface">
                Full document text · extracted &amp; translated
              </summary>
              <div className="mt-md grid grid-cols-1 gap-md lg:grid-cols-2">
                <section className="min-h-[120px] rounded-xl border border-hairline bg-canvas p-md">
                  <h3 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">Extracted · full document</h3>
                  <ul className="m-0 max-h-[55vh] list-none space-y-xs overflow-auto p-0">
                    {data.segments.map((s) => {
                      const conf = confidenceStyle(s.confidence)
                      return (
                        <li key={s.segment_id}>
                          <div
                            ref={(el) => {
                              if (el) extractedSegmentRefs.current.set(s.segment_id, el)
                              else extractedSegmentRefs.current.delete(s.segment_id)
                            }}
                            className={`scroll-mt-2 scroll-mb-2 flex flex-row items-start gap-sm overflow-hidden rounded-lg border px-sm py-sm transition-colors ${
                              selected === s.segment_id
                                ? 'border-primary bg-tint-lavender shadow-[0_0_0_1px_rgba(86,37,168,0.35)]'
                                : 'border-hairline bg-surface-soft hover:border-hairline-strong'
                            }`}
                          >
                            <button
                              type="button"
                              className="min-w-0 flex-1 py-0 text-left"
                              onClick={() => onSelect(s)}
                            >
                              <span className="mb-xxs block text-[11px] font-semibold uppercase tracking-wide text-outline">
                                p{s.page_number}
                                {s.status !== 'auto' ? (
                                  <span className="ml-xs font-semibold normal-case text-primary">· {s.status}</span>
                                ) : null}
                                <span
                                  className={`ml-xs font-semibold normal-case tabular-nums ${conf.textClass}`}
                                  title="Segment confidence"
                                >
                                  · {conf.pct}%
                                </span>
                                {lowConfidence(s.confidence) ? (
                                  <span className="ml-xs text-brand-orange">Low confidence</span>
                                ) : null}
                              </span>
                              <span className="whitespace-pre-wrap text-sm text-on-surface">{s.extracted_text}</span>
                            </button>
                            <div className="shrink-0 self-center">
                              <SegmentReviewSwitch
                                active={segmentReviewSwitchValue(s.status)}
                                disabled={workspaceLocked || segmentReviewBusyId === s.segment_id}
                                onPick={(next) => {
                                  if (segmentReviewSwitchValue(s.status) === next) return
                                  const action =
                                    next === 'pending' ? 'pending' : next === 'approved' ? 'approve' : 'reject'
                                  void setSegmentReviewStatus(s.segment_id, action)
                                }}
                              />
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
                <section className="min-h-[120px] rounded-xl border border-hairline bg-canvas p-md">
                  <h3 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">Translated · full document</h3>
                  <ul className="m-0 max-h-[55vh] list-none space-y-xs overflow-auto p-0">
                    {data.segments.map((s) => {
                      const conf = confidenceStyle(s.confidence)
                      return (
                        <li key={s.segment_id}>
                          <div
                            ref={(el) => {
                              if (el) translatedSegmentRefs.current.set(s.segment_id, el)
                              else translatedSegmentRefs.current.delete(s.segment_id)
                            }}
                            className={`scroll-mt-2 scroll-mb-2 flex flex-row items-start gap-sm overflow-hidden rounded-lg border px-sm py-sm transition-colors ${
                              selected === s.segment_id
                                ? 'border-primary bg-tint-lavender shadow-[0_0_0_1px_rgba(86,37,168,0.35)]'
                                : 'border-hairline bg-surface-soft hover:border-hairline-strong'
                            }`}
                          >
                            <button
                              type="button"
                              className="min-w-0 flex-1 py-0 text-left"
                              onClick={() => onSelect(s)}
                            >
                              <span className="mb-xxs block text-[11px] font-semibold uppercase tracking-wide text-outline">
                                p{s.page_number}
                                {s.status !== 'auto' ? (
                                  <span className="ml-xs font-semibold normal-case text-primary">· {s.status}</span>
                                ) : null}
                                <span
                                  className={`ml-xs font-semibold normal-case tabular-nums ${conf.textClass}`}
                                  title="Segment confidence"
                                >
                                  · {conf.pct}%
                                </span>
                              </span>
                              <span className="whitespace-pre-wrap text-sm text-on-surface">{s.translated_text}</span>
                            </button>
                            <div className="shrink-0 self-center">
                              <SegmentReviewSwitch
                                active={segmentReviewSwitchValue(s.status)}
                                disabled={workspaceLocked || segmentReviewBusyId === s.segment_id}
                                onPick={(next) => {
                                  if (segmentReviewSwitchValue(s.status) === next) return
                                  const action =
                                    next === 'pending' ? 'pending' : next === 'approved' ? 'approve' : 'reject'
                                  void setSegmentReviewStatus(s.segment_id, action)
                                }}
                              />
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              </div>
            </details>
          ) : null}
          {showDualOverlayView ? (
            <>
              {originalIsPdf && originalFileUrl ? (
                <Document file={originalFileUrl} onLoadSuccess={(d) => setNumPages(d.numPages)}>
                  <div className="mb-sm flex flex-wrap items-center gap-sm md:gap-md">
                    <div className="flex flex-wrap items-center gap-sm text-sm text-on-surface-variant">
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
                    <DocumentViewerZoomBar zoom={viewerZoom} onZoomChange={setViewerZoom} buttonClass={btnSecondary} />
                  </div>
                  <div className="grid grid-cols-1 gap-md lg:grid-cols-2">
                    <section className="min-h-[200px] rounded-xl border border-hairline bg-surface-soft p-md lg:min-h-[280px]">
                      <h2 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">Original</h2>
                      <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-canvas p-sm">
                        <div className="relative w-fit max-w-full">
                          <Page
                            key={`pdf-orig-${data.case_id}-${page}`}
                            pageNumber={page}
                            width={pdfViewerWidth}
                            renderTextLayer
                          />
                        </div>
                      </div>
                    </section>
                    <section className="min-h-[200px] rounded-xl border border-hairline bg-surface-soft p-md lg:min-h-[280px]">
                      <h2 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">Translated</h2>
                      <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-canvas p-sm">
                        <div className="relative w-fit max-w-full">
                          <Page
                            key={`pdf-tr-${data.case_id}-${page}`}
                            pageNumber={page}
                            width={pdfViewerWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onRenderSuccess={onTranslatedPdfPageRendered}
                          />
                          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-sm">
                            {data.segments
                              .filter((s) => s.page_number === page)
                              .flatMap((s) => {
                                const bb = segmentBbox(s)
                                if (bb == null) return []
                                const [x, y, bw, bh] = bb
                                return [
                                  <button
                                    key={s.segment_id}
                                    type="button"
                                    className={`pointer-events-auto absolute box-border overflow-y-auto overflow-x-hidden border p-px text-left shadow-sm transition-colors ${selected === s.segment_id ? 'z-20' : 'z-10'} ${translatedOverlaySegmentClass(
                                      s.status,
                                      selected === s.segment_id,
                                    )}`}
                                    style={{
                                      left: `${(x / coordBounds.w) * 100}%`,
                                      top: `${(y / coordBounds.h) * 100}%`,
                                      width: `${(bw / coordBounds.w) * 100}%`,
                                      height: `${(bh / coordBounds.h) * 100}%`,
                                    }}
                                    onClick={() => onSelect(s)}
                                  >
                                    <span className="block min-h-0 min-w-0 hyphens-auto whitespace-pre-wrap break-words text-[10px] leading-tight text-on-surface sm:text-[11px] sm:leading-tight">
                                      {s.translated_text}
                                    </span>
                                  </button>,
                                ]
                              })}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </Document>
              ) : originalIsImage && originalFileUrl ? (
                <div>
                  <div className="mb-sm flex flex-wrap justify-end">
                    <DocumentViewerZoomBar zoom={viewerZoom} onZoomChange={setViewerZoom} buttonClass={btnSecondary} />
                  </div>
                  <div className="grid grid-cols-1 gap-md lg:grid-cols-2">
                    <section className="min-h-[200px] rounded-xl border border-hairline bg-surface-soft p-md lg:min-h-[280px]">
                      <h2 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">Original</h2>
                      <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-canvas p-sm">
                        <div className="relative mx-auto w-fit max-w-full" style={imageViewerZoomStyle}>
                          <img
                            src={originalFileUrl}
                            alt="Original uploaded image"
                            className="max-h-[65vh] w-auto max-w-full object-contain"
                            onLoad={(e) => {
                              const el = e.currentTarget
                              setNativePageDims({ w: el.naturalWidth, h: el.naturalHeight })
                            }}
                          />
                        </div>
                      </div>
                    </section>
                    <section className="min-h-[200px] rounded-xl border border-hairline bg-surface-soft p-md lg:min-h-[280px]">
                      <h2 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">Translated</h2>
                      <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-canvas p-sm">
                        <div className="relative mx-auto w-fit max-w-full" style={imageViewerZoomStyle}>
                          <img
                            src={originalFileUrl}
                            alt=""
                            aria-hidden
                            className="max-h-[65vh] w-auto max-w-full object-contain"
                            onLoad={(e) => {
                              const el = e.currentTarget
                              setNativePageDims({ w: el.naturalWidth, h: el.naturalHeight })
                            }}
                          />
                          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-sm">
                          {data.segments
                            .filter((s) => s.page_number === pageForSegmentLayout)
                            .flatMap((s) => {
                              const bb = segmentBbox(s)
                              if (bb == null) return []
                              const [x, y, bw, bh] = bb
                              return [
                                <button
                                  key={s.segment_id}
                                  type="button"
                                  className={`pointer-events-auto absolute box-border overflow-y-auto overflow-x-hidden border p-px text-left shadow-sm transition-colors ${selected === s.segment_id ? 'z-20' : 'z-10'} ${translatedOverlaySegmentClass(
                                    s.status,
                                    selected === s.segment_id,
                                  )}`}
                                  style={{
                                    left: `${(x / coordBounds.w) * 100}%`,
                                    top: `${(y / coordBounds.h) * 100}%`,
                                    width: `${(bw / coordBounds.w) * 100}%`,
                                    height: `${(bh / coordBounds.h) * 100}%`,
                                  }}
                                  onClick={() => onSelect(s)}
                                >
                                  <span className="block min-h-0 min-w-0 hyphens-auto whitespace-pre-wrap break-words text-[10px] leading-tight text-on-surface sm:text-[11px] sm:leading-tight">
                                    {s.translated_text}
                                  </span>
                                </button>,
                              ]
                            })}
                        </div>
                      </div>
                    </div>
                    </section>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <section className="min-h-[200px] overflow-auto rounded-xl border border-hairline bg-surface-soft p-md lg:min-h-[320px]">
              <h2 className="mb-sm text-xs font-semibold uppercase tracking-wider text-outline">Original</h2>
              {originalFileUrl ? (
                originalIsImage ? (
                  <>
                    <div className="mb-sm flex flex-wrap justify-end">
                      <DocumentViewerZoomBar zoom={viewerZoom} onZoomChange={setViewerZoom} buttonClass={btnSecondary} />
                    </div>
                    <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-canvas p-sm">
                      <div className="mx-auto w-fit" style={imageViewerZoomStyle}>
                        <img
                          src={originalFileUrl}
                          alt="Original uploaded image"
                          className="mx-auto max-h-[65vh] w-auto max-w-full object-contain"
                        />
                      </div>
                    </div>
                  </>
                ) : originalIsPdf ? (
                  <>
                    <div className="mb-sm flex flex-wrap items-center gap-sm md:gap-md">
                      <div className="flex flex-wrap items-center gap-sm text-sm text-on-surface-variant">
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
                      <DocumentViewerZoomBar zoom={viewerZoom} onZoomChange={setViewerZoom} buttonClass={btnSecondary} />
                    </div>
                    <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-canvas p-sm">
                      <Document file={originalFileUrl} onLoadSuccess={(d) => setNumPages(d.numPages)}>
                        <Page pageNumber={page} width={pdfViewerWidth} />
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
          )}
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
