import { useEffect, useId, useRef } from 'react'

export type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onCancel])

  if (!open) return null

  const btnSecondary =
    'rounded-xl border border-hairline-strong bg-canvas px-md py-sm text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-45'
  const btnPrimary =
    'rounded-xl border border-primary bg-primary px-md py-sm text-sm font-medium text-on-primary transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-45'
  const btnDestructive =
    'rounded-xl border border-error-container bg-canvas px-md py-sm text-sm font-medium text-error transition-colors hover:bg-error-container/30 disabled:cursor-not-allowed disabled:opacity-45'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-md" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Dismiss dialog"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-[1] w-full max-w-md rounded-xl border border-hairline bg-canvas p-lg shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-on-surface">
          {title}
        </h2>
        <p id={descriptionId} className="mt-sm text-sm leading-relaxed text-on-surface-variant">
          {message}
        </p>
        <div className="mt-lg flex flex-wrap justify-end gap-sm">
          <button ref={cancelRef} type="button" className={btnSecondary} disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? btnDestructive : btnPrimary}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
