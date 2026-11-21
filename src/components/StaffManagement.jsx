import { useEffect, useState } from 'react'
import { requestWithScope } from './managementApi.js'
import { useRealtimeSync } from './useRealtimeSync.js'

const defaultStaffForm = {
  selectedCentreId: '',
  selectedUserId: '',
  userIdPreview: '',
  email: '',
}

function StaffManagement({ user }) {
  const [mode, setMode] = useState('add')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [centres, setCentres] = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [form, setForm] = useState(defaultStaffForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetFormState() {
    setForm(defaultStaffForm)
  }

  async function loadCentres() {
    const result = await requestWithScope('/centres', user)
    setCentres(result.centres ?? [])
  }

  async function loadStaff() {
    const result = await requestWithScope('/centre-users', user)
    setStaffUsers(result.users ?? [])
  }

  useEffect(() => {
    loadCentres().catch((loadError) => setError(loadError.message))
    loadStaff().catch((loadError) => setError(loadError.message))
  }, [])
  useRealtimeSync({ user, tables: ['centre_users', 'diagnostic_centres'], onChange: loadStaff })

  useEffect(() => {
    if (!isModalOpen || !form.selectedCentreId) {
      setForm((previous) => ({ ...previous, userIdPreview: '' }))
      return
    }
    if (mode !== 'add') return
    requestWithScope(`/centre-users/preview-id?centreId=${encodeURIComponent(form.selectedCentreId)}`, user)
      .then((result) => {
        setForm((previous) => ({ ...previous, userIdPreview: result.user_id || '' }))
      })
      .catch(() => {
        setForm((previous) => ({ ...previous, userIdPreview: '' }))
      })
  }, [form.selectedCentreId, isModalOpen, mode])

  async function handleStaffSelection(userId) {
    if (!userId) return
    setError('')
    setNotice('')
    try {
      const result = await requestWithScope(`/centre-users/${encodeURIComponent(userId)}`, user)
      setMode('edit')
      setIsModalOpen(true)
      setForm({
        selectedCentreId: result.user.centre_id || '',
        selectedUserId: result.user.user_id || '',
        userIdPreview: '',
        email: result.user.email || '',
      })
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : 'Unable to load staff details right now.')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)

    const payload = { centreId: form.selectedCentreId, email: form.email }
    try {
      if (mode === 'add') {
        const result = await requestWithScope('/centre-users', user, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setNotice(`Staff user ${result.user.user_id} created successfully.`)
      } else {
        const result = await requestWithScope(`/centre-users/${encodeURIComponent(form.selectedUserId)}`, user, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        setNotice(`Staff user ${result.user.user_id} updated successfully.`)
      }
      await loadStaff()
      setIsModalOpen(false)
      resetFormState()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save staff user right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Staff / Users</h2>
        <button
          className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
          onClick={() => {
            setMode('add')
            resetFormState()
            setIsModalOpen(true)
          }}
          type="button"
        >
          + Add User
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-3 py-2">User ID</th>
              <th className="px-3 py-2">Centre</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staffUsers.map((staff) => (
              <tr className="border-t border-slate-200" key={staff.user_id}>
                <td className="px-3 py-2">{staff.user_id}</td>
                <td className="px-3 py-2">{staff.centre_id}</td>
                <td className="px-3 py-2">{staff.email}</td>
                <td className="px-3 py-2">
                  <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" onClick={() => handleStaffSelection(staff.user_id)} type="button">✎ Edit</button>
                </td>
              </tr>
            ))}
            {staffUsers.length === 0 && <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={4}>No staff users found.</td></tr>}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 px-3 py-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{mode === 'add' ? 'Add Staff User' : 'Edit Staff User'}</h3>
              <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => setIsModalOpen(false)} type="button">Close</button>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Centre</label>
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, selectedCentreId: event.target.value }))} required value={form.selectedCentreId}>
                  <option value="">Select centre</option>
                  {centres.map((centre) => <option key={centre.centre_id} value={centre.centre_id}>{centre.centre_id} - {centre.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">User ID</label>
                <input className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm" readOnly value={mode === 'add' ? form.userIdPreview : form.selectedUserId} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Email</label>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} required type="email" value={form.email} />
              </div>
              <div className="flex justify-end gap-2">
                <button className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setIsModalOpen(false)} type="button">Cancel</button>
                <button className="rounded bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" disabled={isSubmitting || !form.selectedCentreId || (mode === 'add' && !form.userIdPreview) || (mode === 'edit' && !form.selectedUserId)} type="submit">
                  {isSubmitting ? 'Saving...' : mode === 'add' ? 'Create User' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default StaffManagement
