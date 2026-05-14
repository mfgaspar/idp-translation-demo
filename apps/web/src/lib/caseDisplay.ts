import type { CaseListItem } from '../api/cases'

export function documentTypeLabel(contentType: string | null, filename: string | null): string {
  const f = (filename ?? '').toLowerCase()
  if (contentType === 'application/pdf') {
    if (f.includes('invoice')) return 'Invoice document'
    if (f.includes('bank') || f.includes('statement')) return 'Bank statement'
    return 'PDF document'
  }
  if (contentType === 'image/png' || contentType === 'image/jpeg' || contentType === 'image/jpg') return 'Image'
  if (contentType) return 'Document'
  return 'No document'
}

export function docRowIcon(
  contentType: string | null,
  filename: string | null = null,
): { icon: string; color: string; shortLabel: string } {
  const f = (filename ?? '').toLowerCase()
  if (contentType === 'application/pdf') {
    if (f.includes('invoice')) return { icon: 'receipt_long', color: 'text-brand-teal', shortLabel: 'Invoice PDF' }
    if (f.includes('bank') || f.includes('statement'))
      return { icon: 'account_balance', color: 'text-brand-teal', shortLabel: 'Bank statement PDF' }
    return { icon: 'picture_as_pdf', color: 'text-brand-teal', shortLabel: 'PDF' }
  }
  if (contentType === 'image/png') return { icon: 'image', color: 'text-brand-orange', shortLabel: 'PNG' }
  if (contentType === 'image/jpeg' || contentType === 'image/jpg')
    return { icon: 'image', color: 'text-brand-orange', shortLabel: 'JPEG' }
  if (contentType?.startsWith('image/')) return { icon: 'image', color: 'text-brand-orange', shortLabel: 'Image' }
  if (!contentType) return { icon: 'draft', color: 'text-outline', shortLabel: 'No file' }
  return { icon: 'draft', color: 'text-brand-pink', shortLabel: 'File' }
}

export function caseIdDisplay(row: { id: number; external_ref: string }): string {
  const ref = row.external_ref
  if (ref.length <= 24 && !ref.startsWith('ui-')) return `#${ref}`
  return `#CASE-${row.id}`
}

export function languagePillClass(lang: string | null): { label: string; className: string } {
  if (!lang)
    return {
      label: 'Auto',
      className: 'bg-surface-container-high text-on-surface-variant',
    }
  const l = lang.toLowerCase()
  if (l.includes('zh') || l === 'chinese')
    return { label: 'Chinese', className: 'bg-tint-sky text-link-blue' }
  if (l.includes('es') || l === 'spanish')
    return { label: 'Spanish', className: 'bg-tint-peach text-brand-orange' }
  if (l.includes('en') || l === 'english')
    return { label: 'English', className: 'bg-tint-mint text-brand-green' }
  if (l.includes('fr') || l === 'french')
    return { label: 'French', className: 'bg-tint-lavender text-primary' }
  if (l.includes('de') || l === 'german')
    return { label: 'German', className: 'bg-secondary-fixed text-on-secondary-fixed-variant' }
  if (l.includes('pt') || l === 'portuguese')
    return { label: 'Portuguese', className: 'bg-tint-peach text-brand-orange' }
  return { label: lang, className: 'bg-secondary-fixed text-on-secondary-fixed-variant' }
}

/** Dashboard translation column: from → to as pill labels (resolved source when process used auto). */
export function translationDirectionTags(
  row: Pick<CaseListItem, 'source_language' | 'target_language' | 'primary_language'>,
): { from: ReturnType<typeof languagePillClass>; to: ReturnType<typeof languagePillClass> } | null {
  const tgt = row.target_language
  if (tgt == null) return null
  const rawSrc = row.source_language
  const fromCode =
    rawSrc === 'auto' ? row.primary_language ?? null : rawSrc != null && rawSrc !== '' ? rawSrc : null
  return {
    from: languagePillClass(fromCode),
    to: languagePillClass(tgt),
  }
}

/** Process languages on the latest document (`null` until a run completes). */
export function processLanguageCodes(row: Pick<CaseListItem, 'source_language' | 'target_language'>): {
  display: string | null
} {
  const src = row.source_language
  const tgt = row.target_language
  if (src != null && tgt != null) return { display: `${src} → ${tgt}` }
  if (src != null) return { display: `${src} → …` }
  if (tgt != null) return { display: `… → ${tgt}` }
  return { display: null }
}

export function confidenceStyle(score: number | null): {
  pct: number
  barClass: string
  textClass: string
} {
  if (score == null) return { pct: 0, barClass: 'bg-hairline', textClass: 'text-outline' }
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100)
  if (score >= 0.75) return { pct, barClass: 'bg-brand-green', textClass: 'text-brand-green' }
  if (score >= 0.55) return { pct, barClass: 'bg-brand-orange', textClass: 'text-brand-orange' }
  return { pct, barClass: 'bg-error', textClass: 'text-error' }
}

/** Segment review counts for the case’s latest document (from `GET /cases/`). */
export function segmentReviewSummary(row: CaseListItem): {
  total: number
  parts: { key: 'approved' | 'rejected' | 'edited' | 'pending'; n: number; label: string; className: string }[]
} {
  const a = row.review_approved ?? 0
  const r = row.review_rejected ?? 0
  const e = row.review_edited ?? 0
  const p = row.review_pending ?? 0
  const total = a + r + e + p
  const parts: { key: 'approved' | 'rejected' | 'edited' | 'pending'; n: number; label: string; className: string }[] = []
  if (a > 0) parts.push({ key: 'approved', n: a, label: 'Approved', className: 'bg-tint-mint text-brand-green' })
  if (r > 0) parts.push({ key: 'rejected', n: r, label: 'Rejected', className: 'bg-error-container/50 text-error' })
  if (e > 0) parts.push({ key: 'edited', n: e, label: 'Edited', className: 'bg-tint-lavender text-primary' })
  if (p > 0) parts.push({ key: 'pending', n: p, label: 'Pending', className: 'bg-surface-container-high text-on-surface-variant' })
  return { total, parts }
}

export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const sec = Math.floor((Date.now() - t) / 1000)
  if (sec < 10) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const d = Math.floor(hr / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
