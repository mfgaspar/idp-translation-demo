import { startTransition, useCallback, useEffect, useState } from 'react'
import { createCase, fetchCases } from './api/cases'
import { useMinMd } from './hooks/useMinMd'
import { AppShell } from './layout/AppShell'
import type { AppView } from './layout/AppShell'
import { AuditEvidencePage } from './pages/AuditEvidencePage'
import { DashboardPage } from './pages/DashboardPage'
import { WorkspacePage } from './pages/WorkspacePage'

async function downloadEvidence(caseId: number): Promise<void> {
  const r = await fetch(`/cases/${caseId}/evidence`)
  if (!r.ok) throw new Error(await r.text())
  const data = (await r.json()) as unknown
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `case-${caseId}-evidence.json`
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [view, setView] = useState<AppView>('dashboard')
  const [cases, setCases] = useState<Awaited<ReturnType<typeof fetchCases>>>([])
  const [casesError, setCasesError] = useState<string | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null)
  const [uploadSignal, setUploadSignal] = useState(0)
  const [exportHint, setExportHint] = useState<string | null>(null)
  const [workspaceReturnView, setWorkspaceReturnView] = useState<'dashboard' | 'audit'>('dashboard')
  const [dashboardScope, setDashboardScope] = useState<'active' | 'archived'>('active')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('')

  const mdUp = useMinMd()
  const narrowViewport = !mdUp

  const loadCases = useCallback(async () => {
    setCasesError(null)
    try {
      setCases(await fetchCases())
    } catch (e) {
      setCasesError(e instanceof Error ? e.message : 'Failed to load cases')
    }
  }, [])

  useEffect(() => {
    startTransition(() => {
      void loadCases()
    })
  }, [loadCases])

  const selectCase = useCallback((caseId: number | null) => {
    setSelectedCaseId(caseId)
  }, [])

  const goWorkspace = useCallback(
    (caseId?: number | null, returnView: 'dashboard' | 'audit' = 'dashboard') => {
      if (!mdUp) return
      setWorkspaceReturnView(returnView)
      if (caseId != null && Number.isFinite(caseId)) setSelectedCaseId(caseId)
      setView('workspace')
    },
    [mdUp],
  )

  useEffect(() => {
    if (!mdUp && view === 'workspace') {
      setView('dashboard')
    }
  }, [mdUp, view])

  const requestUpload = async () => {
    if (uploadBusy || !mdUp) return
    setUploadError(null)
    setWorkspaceReturnView('dashboard')
    setUploadBusy(true)
    try {
      const c = await createCase()
      setSelectedCaseId(c.id)
      await loadCases()
      setView('workspace')
      setUploadSignal((s) => s + 1)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not create case')
    } finally {
      setUploadBusy(false)
    }
  }

  const onNavWorkspace = () => {
    const fallback = selectedCaseId ?? cases[0]?.id ?? null
    goWorkspace(fallback, 'dashboard')
  }

  const onFilePickerSignalConsumed = useCallback(() => {
    setUploadSignal(0)
  }, [])

  const onExportAudit = async () => {
    setExportHint(null)
    const id = selectedCaseId
    if (id == null) {
      setExportHint('Select a case in the dashboard table first.')
      return
    }
    try {
      await downloadEvidence(id)
    } catch (e) {
      setExportHint(e instanceof Error ? e.message : 'Export failed')
    }
  }

  return (
    <AppShell
      view={view}
      onNavDashboard={() => setView('dashboard')}
      onNavWorkspace={onNavWorkspace}
      onNavAudit={() => setView('audit')}
      onUpload={() => void requestUpload()}
      uploadBusy={uploadBusy}
      dashboardSearchQuery={dashboardSearchQuery}
      onDashboardSearchQueryChange={setDashboardSearchQuery}
      onExportAudit={() => void onExportAudit()}
      exportHint={exportHint}
      narrowViewport={narrowViewport}
    >
      {uploadError ? (
        <div className="mb-lg flex items-start justify-between gap-md rounded-xl border border-error-container bg-error-container/35 px-lg py-md text-sm text-error">
          <span>{uploadError}</span>
          <button type="button" className="shrink-0 font-medium text-primary hover:underline" onClick={() => setUploadError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {view === 'dashboard' ? (
        <DashboardPage
          caseScope={dashboardScope}
          onCaseScopeChange={setDashboardScope}
          cases={cases}
          error={casesError}
          onRetry={loadCases}
          onReview={(id) => {
            selectCase(id)
            goWorkspace(id, 'dashboard')
          }}
          onAudit={(id) => {
            selectCase(id)
            setView('audit')
          }}
          selectedCaseId={selectedCaseId}
          onSelectCase={selectCase}
          searchQuery={dashboardSearchQuery}
          onSearchQueryChange={setDashboardSearchQuery}
          workspaceDisabled={narrowViewport}
        />
      ) : view === 'workspace' ? (
        <WorkspacePage
          initialCaseId={selectedCaseId}
          onSelectedCaseChange={selectCase}
          openFilePickerSignal={uploadSignal}
          onOpenFilePickerSignalConsumed={onFilePickerSignalConsumed}
          onBack={() => setView(workspaceReturnView)}
          onCasesChanged={loadCases}
          backLabel={workspaceReturnView === 'audit' ? 'Audit evidence' : 'Case dashboard'}
        />
      ) : view === 'audit' ? (
        <AuditEvidencePage
          initialCaseId={selectedCaseId}
          onSelectedCaseChange={selectCase}
          onOpenWorkspace={(id) => {
            selectCase(id)
            goWorkspace(id, 'audit')
          }}
          workspaceDisabled={narrowViewport}
        />
      ) : null}
    </AppShell>
  )
}
