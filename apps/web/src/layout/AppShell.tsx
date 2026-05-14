import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'

export type AppView = 'dashboard' | 'workspace' | 'audit'

type AppShellProps = {
  view: AppView
  onNavDashboard: () => void
  onNavWorkspace: () => void
  onNavAudit: () => void
  onUpload: () => void
  uploadBusy?: boolean
  /** Filters the dashboard case table (id, ref, filename, language codes). */
  dashboardSearchQuery: string
  onDashboardSearchQueryChange: (query: string) => void
  onExportAudit: () => void
  exportHint: string | null
  /** Below `md`: hide header extras, disable new case, restrict mobile drawer. */
  narrowViewport: boolean
  children: ReactNode
}

function navBtn(active: boolean) {
  return `border-b-2 pb-1 text-sm font-medium transition-colors ${
    active ? 'border-primary-fixed text-canvas' : 'border-transparent text-steel hover:text-canvas'
  }`
}

type SideNavBodyProps = {
  view: AppView
  onNavDashboard: () => void
  onNavWorkspace: () => void
  onNavAudit: () => void
  onExportAudit: () => void
  exportHint: string | null
  /** Invoked after a nav or export action (e.g. close mobile drawer). */
  onAfterSelect?: () => void
  /** Mobile drawer: workspace, export, and footer links are unavailable. */
  mobileRestricted?: boolean
}

function AppSideNavBody({
  view,
  onNavDashboard,
  onNavWorkspace,
  onNavAudit,
  onExportAudit,
  exportHint,
  onAfterSelect,
  mobileRestricted = false,
}: SideNavBodyProps) {
  const wrap = useCallback(
    (fn: () => void) => () => {
      fn()
      onAfterSelect?.()
    },
    [onAfterSelect],
  )

  return (
    <>
      <div className="mb-xl px-md">
        <div className="mb-base flex items-center gap-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
            <span className="material-symbols-outlined text-[22px]">account_balance</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-primary">Translation Audit</h3>
            <p className="text-xs font-semibold uppercase tracking-wide text-outline">Review cycle</p>
          </div>
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-xxs overflow-y-auto px-xs">
        <button
          type="button"
          onClick={wrap(onNavDashboard)}
          className={`flex w-full items-center gap-sm rounded-xl px-md py-sm text-left text-sm font-semibold transition-all ${
            view === 'dashboard'
              ? 'scale-[0.98] bg-tint-lavender text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          <span className="material-symbols-outlined">folder_open</span>
          Dashboard
        </button>
        {mobileRestricted ? (
          <span
            className="flex cursor-not-allowed items-center gap-sm rounded-xl px-md py-sm text-sm font-medium text-on-surface-variant/60"
            title="Workspace is available on tablet or desktop (wider screen)."
          >
            <span className="material-symbols-outlined">description</span>
            Workspace
          </span>
        ) : (
          <button
            type="button"
            onClick={wrap(onNavWorkspace)}
            className={`flex w-full items-center gap-sm rounded-xl px-md py-sm text-left text-sm font-medium transition-all ${
              view === 'workspace'
                ? 'scale-[0.98] bg-tint-lavender text-primary'
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined">description</span>
            Workspace
          </button>
        )}
        <button
          type="button"
          onClick={wrap(onNavAudit)}
          className={`flex w-full items-center gap-sm rounded-xl px-md py-sm text-left text-sm font-medium transition-all ${
            view === 'audit'
              ? 'scale-[0.98] bg-tint-lavender text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          <span className="material-symbols-outlined">history_edu</span>
          Audit evidence
        </button>
        <span className="flex cursor-not-allowed items-center gap-sm rounded-xl px-md py-sm text-sm font-medium text-on-surface-variant/60">
          <span className="material-symbols-outlined">settings</span>
          Settings
        </span>
      </nav>
      <div className="mt-auto space-y-sm px-xs">
        {mobileRestricted ? (
          <span
            className="flex cursor-not-allowed items-center justify-center gap-xs rounded-xl border border-hairline bg-surface-container-highest py-sm text-sm font-medium text-on-surface-variant/60"
            title="Export is available on tablet or desktop (wider screen)."
          >
            <span className="material-symbols-outlined text-[18px]">ios_share</span>
            Export audit trail
          </span>
        ) : (
          <button
            type="button"
            onClick={wrap(onExportAudit)}
            className="flex w-full items-center justify-center gap-xs rounded-xl border border-hairline bg-surface-container-highest py-sm text-sm font-medium text-primary transition-colors hover:bg-surface-dim"
          >
            <span className="material-symbols-outlined text-[18px]">ios_share</span>
            Export audit trail
          </button>
        )}
        {exportHint && !mobileRestricted ? <p className="px-md text-xs text-error">{exportHint}</p> : null}
        <div className="border-t border-hairline pt-md">
          {mobileRestricted ? (
            <>
              <span className="flex cursor-not-allowed items-center gap-sm px-md py-xs text-xs font-semibold text-on-surface-variant/60">
                <span className="material-symbols-outlined text-[20px]">contact_support</span>
                Support
              </span>
              <span className="flex cursor-not-allowed items-center gap-sm px-md py-xs text-xs font-semibold text-on-surface-variant/60">
                <span className="material-symbols-outlined text-[20px]">terminal</span>
                API docs
              </span>
            </>
          ) : (
            <>
              <a
                className="flex items-center gap-sm px-md py-xs text-xs font-semibold text-outline hover:text-primary"
                href="https://www.hitachids.com/insights/caai/"
                target="_blank"
                rel="noreferrer"
              >
                <span className="material-symbols-outlined text-[20px]">contact_support</span>
                Support
              </a>
              <a
                className="flex items-center gap-sm px-md py-xs text-xs font-semibold text-outline hover:text-primary"
                href="/docs"
                target="_blank"
                rel="noreferrer"
              >
                <span className="material-symbols-outlined text-[20px]">terminal</span>
                API docs
              </a>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export function AppShell({
  view,
  onNavDashboard,
  onNavWorkspace,
  onNavAudit,
  onUpload,
  uploadBusy = false,
  dashboardSearchQuery,
  onDashboardSearchQueryChange,
  onExportAudit,
  exportHint,
  narrowViewport,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])
  const drawerId = useId()

  useEffect(() => {
    if (!mobileMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileMenuOpen])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      if (mq.matches) setMobileMenuOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const sideNavProps: SideNavBodyProps = {
    view,
    onNavDashboard,
    onNavWorkspace,
    onNavAudit,
    onExportAudit,
    exportHint,
  }

  return (
    <>
      <nav className="fixed top-0 z-[80] flex h-16 w-full items-center justify-between border-b border-brand-navy-mid bg-brand-navy px-lg shadow-md dark:bg-brand-navy-deep">
        <div className="flex min-w-0 flex-1 items-center gap-sm md:gap-xl">
          <button
            type="button"
            className="material-symbols-outlined shrink-0 rounded p-xxs text-canvas hover:bg-brand-navy-mid/50 md:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls={drawerId}
            onClick={() => setMobileMenuOpen((o) => !o)}
          >
            {mobileMenuOpen ? 'close' : 'menu'}
          </button>
          <span className="truncate text-lg font-bold tracking-tight text-canvas sm:text-xl">TranslateAI</span>
          <div className="hidden items-center gap-lg md:flex">
            <button type="button" onClick={onNavDashboard} className={navBtn(view === 'dashboard')}>
              Dashboard
            </button>
            <button type="button" onClick={onNavWorkspace} className={navBtn(view === 'workspace')}>
              Workspace
            </button>
            <button type="button" onClick={onNavAudit} className={navBtn(view === 'audit')}>
              Audit evidence
            </button>
          </div>
        </div>
        <div className="flex items-center gap-md">
          <div className="relative hidden lg:block">
            <label htmlFor="app-shell-quick-search" className="sr-only">
              Search cases on dashboard
            </label>
            <input
              id="app-shell-quick-search"
              className="w-64 rounded-xl border-none bg-brand-navy-mid px-md py-xxs text-sm text-canvas placeholder:text-steel focus:ring-2 focus:ring-primary-fixed"
              placeholder="Quick search…"
              type="search"
              autoComplete="off"
              value={dashboardSearchQuery}
              onChange={(e) => onDashboardSearchQueryChange(e.target.value)}
              title="Filter cases by ID, external reference, filename, or language code on the dashboard"
            />
          </div>
          <button
            type="button"
            className={`material-symbols-outlined rounded p-xxs text-canvas hover:bg-brand-navy-mid/50 ${narrowViewport ? 'hidden' : ''}`}
            aria-label="Notifications"
          >
            notifications
          </button>
          <button
            type="button"
            className={`material-symbols-outlined rounded p-xxs text-canvas hover:bg-brand-navy-mid/50 ${narrowViewport ? 'hidden' : ''}`}
            aria-label="Help"
          >
            help_outline
          </button>
          <button
            type="button"
            onClick={onUpload}
            disabled={uploadBusy || narrowViewport}
            title={narrowViewport ? 'Creating cases requires a wider screen.' : undefined}
            className="rounded-xl bg-primary px-md py-xxs text-sm font-medium text-on-primary transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadBusy ? (
              <>
                <span className="sm:hidden">Creating…</span>
                <span className="hidden sm:inline">Creating new case…</span>
              </>
            ) : (
              <>
                <span className="sm:hidden">New case</span>
                <span className="hidden sm:inline">Create new case</span>
              </>
            )}
          </button>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-navy-mid bg-primary-fixed-dim text-xs font-bold text-on-primary-fixed"
            title="Reviewer"
          >
            LC
          </div>
        </div>
      </nav>

      {mobileMenuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 top-16 z-[60] bg-black/45 md:hidden"
            aria-label="Close navigation menu"
            onClick={closeMobileMenu}
          />
          <aside
            id={drawerId}
            className="fixed left-0 top-16 z-[70] flex h-[calc(100dvh-4rem)] w-[min(20rem,90vw)] flex-col border-r border-hairline bg-surface py-md pl-xs pr-sm shadow-xl md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
          >
            <AppSideNavBody {...sideNavProps} onAfterSelect={closeMobileMenu} mobileRestricted />
          </aside>
        </>
      ) : null}

      <div className="flex h-screen overflow-hidden pt-16">
        <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-hairline bg-surface py-md pl-xs pr-sm md:flex">
          <AppSideNavBody {...sideNavProps} />
        </aside>
        <main className="flex-1 overflow-y-auto bg-surface-soft p-lg">{children}</main>
      </div>
    </>
  )
}
