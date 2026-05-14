import { useEffect, useMemo, useState } from 'react'
import type { CaseListItem } from '../api/cases'
import {
  caseIdDisplay,
  confidenceStyle,
  documentTypeLabel,
  docRowIcon,
  formatRelativeTime,
  segmentReviewSummary,
  translationDirectionTags,
} from '../lib/caseDisplay'

type SortKey = 'uploaded' | 'confidence' | 'type'

export type DashboardCaseScope = 'active' | 'archived'

type Props = {
  caseScope: DashboardCaseScope
  onCaseScopeChange: (scope: DashboardCaseScope) => void
  cases: CaseListItem[]
  error: string | null
  onRetry: () => void
  onReview: (caseId: number) => void
  onAudit: (caseId: number) => void
  selectedCaseId: number | null
  onSelectCase: (caseId: number | null) => void
  /** Shared with the header quick search; filters this dashboard’s table. */
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  /** Below `md`: Review (workspace) is unavailable; Audit still works. */
  workspaceDisabled?: boolean
}

const PAGE_SIZE_OPTIONS = [4, 10, 25, 50] as const

export function DashboardPage({
  caseScope,
  onCaseScopeChange,
  cases,
  error,
  onRetry,
  onReview,
  onAudit,
  selectedCaseId,
  onSelectCase,
  searchQuery,
  onSearchQueryChange,
  workspaceDisabled = false,
}: Props) {
  const [sort, setSort] = useState<SortKey>('uploaded')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(4)

  useEffect(() => {
    setPage(1)
  }, [caseScope])

  const scopeCases = useMemo(() => {
    if (caseScope === 'archived') return cases.filter((c) => c.segment_review_complete)
    return cases.filter((c) => !c.segment_review_complete)
  }, [cases, caseScope])

  const stats = useMemo(() => {
    const active = cases.filter((c) => !c.segment_review_complete).length
    const archived = cases.filter((c) => c.segment_review_complete).length
    const openSegmentRows = cases.filter((c) => c.review_pending > 0).length
    return { active, archived, openSegmentRows }
  }, [cases])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let rows = scopeCases.filter((c) => {
      if (!q) return true
      return (
        String(c.id).includes(q) ||
        c.external_ref.toLowerCase().includes(q) ||
        (c.original_filename ?? '').toLowerCase().includes(q) ||
        documentTypeLabel(c.content_type, c.original_filename).toLowerCase().includes(q) ||
        (c.primary_language ?? '').toLowerCase().includes(q) ||
        (c.target_language ?? '').toLowerCase().includes(q) ||
        (c.source_language ?? '').toLowerCase().includes(q)
      )
    })
    rows = [...rows]
    if (sort === 'uploaded') {
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else if (sort === 'confidence') {
      rows.sort((a, b) => (b.avg_confidence ?? -1) - (a.avg_confidence ?? -1))
    } else {
      rows.sort((a, b) => documentTypeLabel(a.content_type, a.original_filename).localeCompare(documentTypeLabel(b.content_type, b.original_filename)))
    }
    return rows
  }, [scopeCases, searchQuery, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const slicePage = Math.min(Math.max(1, page), totalPages)
  const pageRows = filtered.slice((slicePage - 1) * pageSize, slicePage * pageSize)

  return (
    <>
      <header className="mb-xxl">
        <h1 className="mb-base text-3xl font-semibold tracking-tight text-on-background sm:text-4xl">Case dashboard</h1>
        <p className="max-w-2xl text-base text-on-surface-variant">
          Active cases still have segments in <span className="font-medium text-on-surface">automatic</span> review on the
          latest document. Archived cases have every segment decided (approved, rejected, or edited). Use the filter below
          to switch the table between the two lists.
        </p>
      </header>

      <section className="mb-xl grid grid-cols-1 gap-lg md:grid-cols-3">
        <div className="group relative overflow-hidden rounded-xl border border-hairline bg-canvas p-xl shadow-sm transition-shadow hover:shadow-md">
          <div className="absolute -right-12 -top-12 h-24 w-24 rounded-bl-full bg-tint-peach transition-all group-hover:-right-8 group-hover:-top-8" />
          <div className="relative flex flex-col">
            <span className="mb-xs text-xs font-semibold uppercase tracking-wider text-outline">Cases with pending segments</span>
            <div className="flex items-baseline gap-xs">
              <span className="text-4xl font-semibold tracking-tight text-on-background sm:text-5xl">{stats.openSegmentRows}</span>
              <span className="text-sm font-medium text-brand-orange">auto status left</span>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-hairline bg-canvas p-xl shadow-sm transition-shadow hover:shadow-md">
          <div className="absolute -right-12 -top-12 h-24 w-24 rounded-bl-full bg-tint-sky transition-all group-hover:-right-8 group-hover:-top-8" />
          <div className="relative flex flex-col">
            <span className="mb-xs text-xs font-semibold uppercase tracking-wider text-outline">Active cases</span>
            <div className="flex items-baseline gap-xs">
              <span className="text-4xl font-semibold tracking-tight text-on-background sm:text-5xl">{stats.active}</span>
              <span className="text-sm font-medium text-on-surface-variant">review not complete</span>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-hairline bg-canvas p-xl shadow-sm transition-shadow hover:shadow-md">
          <div className="absolute -right-12 -top-12 h-24 w-24 rounded-bl-full bg-tint-mint transition-all group-hover:-right-8 group-hover:-top-8" />
          <div className="relative flex flex-col">
            <span className="mb-xs text-xs font-semibold uppercase tracking-wider text-outline">Archived (review complete)</span>
            <div className="flex items-baseline gap-xs">
              <span className="text-4xl font-semibold tracking-tight text-on-background sm:text-5xl">{stats.archived}</span>
              <span className="text-sm font-medium text-brand-green">all segments closed</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-lg flex flex-col items-stretch justify-between gap-md md:flex-row md:items-center">
        <div className="flex w-full flex-col gap-md md:w-auto md:flex-row md:items-center">
          <div
            className="inline-flex rounded-xl border border-hairline-strong bg-surface p-xxs"
            role="group"
            aria-label="Case list"
          >
            <button
              type="button"
              className={`rounded-lg px-md py-sm text-sm font-semibold transition-colors ${
                caseScope === 'active' ? 'bg-primary text-canvas shadow-sm' : 'text-on-surface hover:bg-surface-container-low'
              }`}
              onClick={() => onCaseScopeChange('active')}
            >
              Active cases
            </button>
            <button
              type="button"
              className={`rounded-lg px-md py-sm text-sm font-semibold transition-colors ${
                caseScope === 'archived' ? 'bg-primary text-canvas shadow-sm' : 'text-on-surface hover:bg-surface-container-low'
              }`}
              onClick={() => onCaseScopeChange('archived')}
            >
              Archived
            </button>
          </div>
          <div className="relative w-full md:w-80">
            <span className="material-symbols-outlined pointer-events-none absolute left-md top-1/2 -translate-y-1/2 text-outline">
              search
            </span>
            <input
              className="w-full rounded-xl border border-hairline-strong bg-canvas py-sm pl-12 pr-md text-base text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              placeholder="Search cases, filenames, or language codes…"
              value={searchQuery}
              onChange={(e) => {
                onSearchQueryChange(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-outline">Sort by</span>
          <select
            className="cursor-pointer border-none bg-transparent text-sm font-medium text-on-surface focus:ring-0"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="uploaded">Uploaded time (newest)</option>
            <option value="confidence">Confidence score</option>
            <option value="type">File type</option>
          </select>
        </div>
      </section>

      {error ? (
        <div className="mb-lg rounded-xl border border-error-container bg-error-container/40 px-lg py-md text-sm text-error">
          <p className="font-medium">{error}</p>
          <button type="button" className="mt-sm text-primary underline" onClick={() => void onRetry()}>
            Retry
          </button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline bg-surface">
                <th className="px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">Case ID</th>
                <th className="w-14 px-lg py-md text-center text-xs font-semibold uppercase tracking-wider text-outline">Type</th>
                <th className="px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline" title="Source and target for the latest document process">
                  Translation
                </th>
                <th className="px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">Uploaded time</th>
                <th className="px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">Confidence score</th>
                <th className="px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">Segment review</th>
                <th className="px-lg py-md text-xs font-semibold uppercase tracking-wider text-outline">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-lg py-xl text-center text-on-surface-variant">
                    {caseScope === 'archived'
                      ? 'No archived cases yet. When every segment on the latest document is approved, rejected, or edited, the case appears here.'
                      : 'No active cases match your filters. Upload and process a document, or adjust search.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const { icon, color, shortLabel } = docRowIcon(row.content_type, row.original_filename)
                  const conf = confidenceStyle(row.avg_confidence)
                  const review = segmentReviewSummary(row)
                  const selected = selectedCaseId === row.id
                  const transTags = translationDirectionTags(row)
                  return (
                    <tr
                      key={row.id}
                      className={`group transition-colors hover:bg-surface-container-low ${selected ? 'bg-tint-lavender/50' : ''}`}
                    >
                      <td className="px-lg py-lg">
                        <button
                          type="button"
                          className="text-left font-medium text-primary hover:underline"
                          onClick={() => onSelectCase(row.id)}
                          title={row.external_ref}
                        >
                          {caseIdDisplay(row)}
                        </button>
                      </td>
                      <td className="px-lg py-lg">
                        <div className="flex justify-center">
                          <span
                            className={`material-symbols-outlined text-[20px] leading-none ${color}`}
                            title={shortLabel}
                            aria-label={shortLabel}
                          >
                            {icon}
                          </span>
                        </div>
                      </td>
                      <td className="px-lg py-lg">
                        {transTags == null ? (
                          <span className="text-sm text-on-surface-variant">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-xs">
                            <span
                              className={`inline-flex items-center rounded-full px-sm py-xxs text-xs font-semibold ${transTags.from.className}`}
                              title="Source (detected or chosen)"
                            >
                              {transTags.from.label}
                            </span>
                            <span className="text-xs font-medium text-outline" aria-hidden>
                              →
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-sm py-xxs text-xs font-semibold ${transTags.to.className}`}
                              title="Target"
                            >
                              {transTags.to.label}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-lg py-lg text-base text-on-surface-variant">{formatRelativeTime(row.created_at)}</td>
                      <td className="px-lg py-lg">
                        <div className="flex items-center gap-sm">
                          <div className="h-2 w-12 overflow-hidden rounded-full bg-hairline">
                            <div className={`h-full ${conf.barClass}`} style={{ width: `${row.avg_confidence == null ? 0 : conf.pct}%` }} />
                          </div>
                          <span className={`text-xs font-semibold ${conf.textClass}`}>
                            {row.avg_confidence == null ? '—' : `${conf.pct}%`}
                          </span>
                        </div>
                      </td>
                      <td className="px-lg py-lg">
                        {review.total === 0 ? (
                          <span className="text-sm text-on-surface-variant">—</span>
                        ) : (
                          <div className="flex max-w-[14rem] flex-wrap gap-xs">
                            {review.parts.map((p, i) => (
                              <span
                                key={`${p.key}-${i}`}
                                className={`inline-flex items-center rounded-full px-sm py-xxs text-xs font-semibold ${p.className}`}
                                title={`${p.n} segment${p.n === 1 ? '' : 's'} ${p.label.toLowerCase()}`}
                              >
                                {p.n} {p.label.toLowerCase()}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-lg py-lg">
                        <div className="flex flex-wrap items-center gap-xs opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                          <button
                            type="button"
                            className="rounded-lg bg-primary px-lg py-xs text-sm font-medium text-canvas disabled:cursor-not-allowed disabled:opacity-45"
                            disabled={workspaceDisabled}
                            title={
                              workspaceDisabled
                                ? 'Review opens the workspace — use a tablet or desktop (wider screen).'
                                : undefined
                            }
                            onClick={() => onReview(row.id)}
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-hairline-strong bg-canvas px-lg py-xs text-sm font-medium text-primary hover:bg-surface-container-low"
                            onClick={() => onAudit(row.id)}
                          >
                            Audit
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-md border-t border-hairline bg-surface px-lg py-md">
          <div className="flex flex-wrap items-center gap-x-lg gap-y-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-outline">
              Showing {pageRows.length} of {filtered.length} cases
            </span>
            <label className="flex items-center gap-sm text-xs font-semibold uppercase tracking-wide text-outline">
              Rows per page
              <select
                className="cursor-pointer rounded-lg border border-hairline-strong bg-canvas px-sm py-xxs text-sm font-medium normal-case tracking-normal text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
                  setPage(1)
                }}
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-xxs">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-strong text-outline transition-colors hover:bg-canvas disabled:opacity-40"
              disabled={slicePage <= 1}
              onClick={() => setPage(slicePage - 1)}
              aria-label="Previous page"
            >
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                  p === slicePage ? 'bg-primary text-canvas' : 'border border-hairline-strong text-outline hover:bg-canvas'
                }`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-strong text-outline transition-colors hover:bg-canvas disabled:opacity-40"
              disabled={slicePage >= totalPages}
              onClick={() => setPage(slicePage + 1)}
              aria-label="Next page"
            >
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
