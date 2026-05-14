import CaseWorkspace from '../components/CaseWorkspace'

type Props = {
  initialCaseId: number | null
  openFilePickerSignal: number
  onOpenFilePickerSignalConsumed?: () => void
  onBack: () => void
  onCasesChanged: () => void
  /** Shown next to the back arrow (e.g. which screen you return to). */
  backLabel?: string
}

export function WorkspacePage({
  initialCaseId,
  openFilePickerSignal,
  onOpenFilePickerSignalConsumed,
  onBack,
  onCasesChanged,
  backLabel = 'Case dashboard',
}: Props) {
  return (
    <>
      <header className="mb-xl flex flex-wrap items-end justify-between gap-md">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-sm inline-flex items-center gap-xs text-sm font-medium text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {backLabel}
          </button>
          <h1 className="text-3xl font-semibold tracking-tight text-on-background sm:text-4xl">Workspace</h1>
          <p className="mt-xs max-w-2xl text-base text-on-surface-variant">
            Upload a PDF or image, run OCR and translation, then review segments side by side with the original document.
          </p>
        </div>
      </header>
      <CaseWorkspace
        initialCaseId={initialCaseId}
        openFilePickerSignal={openFilePickerSignal}
        onOpenFilePickerSignalConsumed={onOpenFilePickerSignalConsumed}
        onCasesChanged={onCasesChanged}
        onCaseDeleted={onBack}
      />
    </>
  )
}
