import { docRowIcon } from './caseDisplay'

export function DocumentTypeIcon(props: {
  contentType: string | null
  filename?: string | null
  /** Tailwind text-size class for the icon glyph */
  sizeClass?: string
  className?: string
}) {
  const { icon, color, shortLabel } = docRowIcon(props.contentType, props.filename ?? null)
  const sizeClass = props.sizeClass ?? 'text-[22px]'
  return (
    <span
      className={`material-symbols-outlined shrink-0 leading-none ${color} ${sizeClass} ${props.className ?? ''}`}
      title={shortLabel}
      aria-label={shortLabel}
    >
      {icon}
    </span>
  )
}
