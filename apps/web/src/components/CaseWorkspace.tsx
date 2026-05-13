import { useCallback, useMemo, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { ViewerResponse, ViewerSegment } from '../api/types'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

async function fetchViewer(caseId: number): Promise<ViewerResponse> {
  const r = await fetch(`/cases/${caseId}/viewer`)
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<ViewerResponse>
}

async function postReview(caseId: number, segmentId: string, action: 'approve' | 'reject') {
  const r = await fetch(`/cases/${caseId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segment_id: segmentId, action }),
  })
  if (!r.ok) throw new Error(await r.text())
}

export default function CaseWorkspace() {
  const [caseIdInput, setCaseIdInput] = useState('1')
  const [caseId, setCaseId] = useState<number | null>(null)
  const [data, setData] = useState<ViewerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setError(null)
    const id = Number(caseIdInput)
    if (!Number.isFinite(id) || id < 1) {
      setError('Enter a valid case id')
      return
    }
    try {
      const v = await fetchViewer(id)
      setCaseId(id)
      setData(v)
      setSelected(v.segments[0]?.segment_id ?? null)
      setPage(1)
    } catch (e) {
      setData(null)
      setCaseId(null)
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [caseIdInput])

  const pdfUrl = useMemo(() => {
    if (!data?.original_file_url) return null
    return data.original_file_url
  }, [data])

  const onSelect = (seg: ViewerSegment) => {
    setSelected(seg.segment_id)
    setPage(seg.page_number)
  }

  const lowConfidence = (c: number) => c < 0.55

  return (
    <div className="workspace">
      <div className="toolbar">
        <label>
          Case id{' '}
          <input
            value={caseIdInput}
            onChange={(e) => setCaseIdInput(e.target.value)}
            type="number"
            min={1}
          />
        </label>
        <button type="button" onClick={() => void load()}>
          Load viewer
        </button>
        {caseId != null && selected && (
          <>
            <button type="button" onClick={() => void postReview(caseId, selected, 'approve')}>
              Approve segment
            </button>
            <button type="button" onClick={() => void postReview(caseId, selected, 'reject')}>
              Reject segment
            </button>
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="panes">
          <section className="pane doc">
            <h2>Original</h2>
            {pdfUrl ? (
              <>
                <div className="pager">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Prev
                  </button>
                  <span>
                    Page {page} / {numPages || '…'}
                  </span>
                  <button
                    type="button"
                    disabled={numPages > 0 && page >= numPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
                <Document file={pdfUrl} onLoadSuccess={(d) => setNumPages(d.numPages)}>
                  <Page pageNumber={page} width={360} />
                </Document>
              </>
            ) : (
              <p>No document on this case.</p>
            )}
          </section>
          <section className="pane">
            <h2>Extracted</h2>
            <ul className="seg-list">
              {data.segments.map((s) => (
                <li key={s.segment_id}>
                  <button
                    type="button"
                    className={selected === s.segment_id ? 'row selected' : 'row'}
                    onClick={() => onSelect(s)}
                  >
                    <span className="meta">
                      p{s.page_number}
                      {lowConfidence(s.confidence) ? <span className="flag">low conf.</span> : null}
                    </span>
                    <span className="txt">{s.extracted_text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="pane">
            <h2>Translated</h2>
            <ul className="seg-list">
              {data.segments.map((s) => (
                <li key={s.segment_id}>
                  <button
                    type="button"
                    className={selected === s.segment_id ? 'row selected' : 'row'}
                    onClick={() => onSelect(s)}
                  >
                    <span className="meta">p{s.page_number}</span>
                    <span className="txt">{s.translated_text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
