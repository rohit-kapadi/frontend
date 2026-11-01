import { useMemo, useState } from 'react'
import CentreManagement from './CentreManagement.jsx'
import StaffManagement from './StaffManagement.jsx'
import DoctorManagement from './DoctorManagement.jsx'
import NewCaseModal from './NewCaseModal.jsx'
import CaseManagementTable from './CaseManagementTable.jsx'

function WorkspaceDashboard({ user, onLogout }) {
  const [activeView, setActiveView] = useState('cases')
  const [caseNotice, setCaseNotice] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false)
  const [caseModalMode, setCaseModalMode] = useState('create')
  const [selectedCase, setSelectedCase] = useState(null)
  const [casesReloadKey, setCasesReloadKey] = useState(0)
  const displayName = user.name || user.email || user.id
  const normalizedRole = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : ''
  const isDiagnosticCentreUser = ['centre_user', 'centre_manager'].includes(normalizedRole)
  const canManageCentresAndStaff = ['group_admin', 'nexus_admin', 'admin'].includes(normalizedRole)
  const canCreateCase = isDiagnosticCentreUser || canManageCentresAndStaff

  const sidebarLinks = useMemo(() => {
    const links = [
      { key: 'cases', label: 'Cases List' },
    ]
    if (canCreateCase) links.push({ key: 'new-case', label: 'New Case' })

    if (canManageCentresAndStaff && !isDiagnosticCentreUser) {
      links.push({ key: 'add-centre', label: 'Add Centre' })
      links.push({ key: 'add-staff', label: 'Add Staff' })
    }

    if (canManageCentresAndStaff) {
      links.push({ key: 'add-doctor', label: 'Add Doctor' })
    }

    return links
  }, [canCreateCase, canManageCentresAndStaff, isDiagnosticCentreUser])

  const handleSidebarSelection = (key) => {
    if (key === 'new-case') {
      setCaseModalMode('create')
      setSelectedCase(null)
      setIsCaseModalOpen(true)
      setActiveView('cases')
      return
    }
    setActiveView(key)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-[96rem]">
        <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-teal-700 text-lg font-bold text-white">R</div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-teal-800">RADIOLOGISTS CLUB</p>
              <p className="text-xs text-slate-500">{displayName} • Nexus {user.nexus_id}</p>
            </div>
          </div>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white" onClick={onLogout} type="button">
            Sign out
          </button>
        </header>

        <div className={`mt-6 grid gap-4 ${isSidebarCollapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[250px_minmax(0,1fr)]'}`}>
          <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <button
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="mb-3 flex w-full items-center justify-center rounded-xl border border-slate-200 px-2 py-2 text-slate-700 hover:bg-slate-50"
              onClick={() => setIsSidebarCollapsed((previous) => !previous)}
              type="button"
            >
              <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {!isSidebarCollapsed && <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Management</p>}
            <nav className="space-y-2">
              {sidebarLinks.map((item) => (
                <button
                  key={item.key}
                  className={`w-full rounded-xl px-3 py-2 ${isSidebarCollapsed ? 'text-center' : 'text-left'} text-sm font-medium transition ${
                    activeView === item.key
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => handleSidebarSelection(item.key)}
                  title={item.label}
                  type="button"
                >
                  {isSidebarCollapsed ? item.label[0] : item.label}
                </button>
              ))}
            </nav>
          </aside>

          <section>
            {activeView === 'cases' && (
              <CaseManagementTable
                notice={caseNotice}
                onEditCase={(caseItem) => {
                  setSelectedCase(caseItem)
                  setCaseModalMode('edit')
                  setIsCaseModalOpen(true)
                }}
                onReopenCase={(caseItem) => {
                  setSelectedCase(caseItem)
                  setCaseModalMode('reopen')
                  setIsCaseModalOpen(true)
                }}
                reloadKey={casesReloadKey}
                user={user}
              />
            )}
            {activeView === 'add-centre' && <CentreManagement user={user} />}
            {activeView === 'add-staff' && <StaffManagement user={user} />}
            {activeView === 'add-doctor' && <DoctorManagement user={user} />}
          </section>
        </div>
      </div>

      <NewCaseModal
        initialCase={selectedCase}
        isOpen={canCreateCase && isCaseModalOpen}
        mode={caseModalMode}
        onClose={() => {
          setIsCaseModalOpen(false)
          setSelectedCase(null)
        }}
        onCreated={(createdCase) => {
          setCaseNotice(`Case #${createdCase?.case_id} ${createdCase?.status === 'Draft' ? 'saved as draft' : 'submitted'} successfully.`)
          setCasesReloadKey((previous) => previous + 1)
          setActiveView('cases')
          setIsCaseModalOpen(false)
          setSelectedCase(null)
        }}
        onUpdated={(updatedCase) => {
          setCaseNotice(`Case #${updatedCase?.case_id} updated successfully.`)
          setCasesReloadKey((previous) => previous + 1)
          setActiveView('cases')
          setIsCaseModalOpen(false)
          setSelectedCase(null)
        }}
        onReopened={(reopenedCase) => {
          setCaseNotice(`Case #${reopenedCase?.case_id} is reopened.`)
          setCasesReloadKey((previous) => previous + 1)
          setActiveView('cases')
          setIsCaseModalOpen(false)
          setSelectedCase(null)
        }}
        user={user}
      />
    </main>
  )
}

export default WorkspaceDashboard
