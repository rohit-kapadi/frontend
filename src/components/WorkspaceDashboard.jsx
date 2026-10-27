import { useMemo, useState } from 'react'
import CentreManagement from './CentreManagement.jsx'
import StaffManagement from './StaffManagement.jsx'
import DoctorManagement from './DoctorManagement.jsx'
import NewCaseModal from './NewCaseModal.jsx'

function CasesListView({ notice }) {
  const sampleCases = useMemo(
    () => [
      { id: '1234501', patient: 'Aarav Mehta', modality: 'CT', status: 'Unassigned', priority: 'Normal' },
      { id: '1234502', patient: 'Nisha Verma', modality: 'MRI', status: 'Assigned', priority: 'Emergency' },
    ],
    [],
  )

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Cases</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Primary Cases List</h2>
      {notice && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Case ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Modality</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sampleCases.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-sm text-slate-900">{item.id}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{item.patient}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{item.modality}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{item.priority}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WorkspaceDashboard({ user, onLogout }) {
  const [activeView, setActiveView] = useState('cases')
  const [caseNotice, setCaseNotice] = useState('')
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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Management</p>
            <nav className="space-y-2">
              {sidebarLinks.map((item) => (
                <button
                  key={item.key}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                    activeView === item.key
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => setActiveView(item.key)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          <section>
            {(activeView === 'cases' || activeView === 'new-case') && <CasesListView notice={caseNotice} />}
            {activeView === 'add-centre' && <CentreManagement user={user} />}
            {activeView === 'add-staff' && <StaffManagement user={user} />}
            {activeView === 'add-doctor' && <DoctorManagement user={user} />}
          </section>
        </div>
      </div>

      <NewCaseModal
        isOpen={canCreateCase && activeView === 'new-case'}
        onClose={() => setActiveView('cases')}
        onCreated={(createdCase) => {
          setCaseNotice(`Case #${createdCase?.case_id} ${createdCase?.status === 'Draft' ? 'saved as draft' : 'submitted'} successfully.`)
          setActiveView('cases')
        }}
        user={user}
      />
    </main>
  )
}

export default WorkspaceDashboard
