import { useEffect, useState } from 'react'
import { requestWithScope } from './managementApi.js'

const defaultStaffForm = {
  selectedCentreId: '',
  selectedUserId: '',
  userIdPreview: '',
  email: '',
}

function StaffManagement({ user }) {
  const [mode, setMode] = useState('add')
  const [centres, setCentres] = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [form, setForm] = useState(defaultStaffForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetFormState() {
    setForm(defaultStaffForm)
    setStaffUsers([])
  }

  async function loadCentres() {
    const result = await requestWithScope('/centres', user)
    setCentres(result.centres ?? [])
  }

  async function loadStaff(centreId) {
    if (!centreId) {
      setStaffUsers([])
      return
    }
    const result = await requestWithScope(`/centre-users?centreId=${encodeURIComponent(centreId)}`, user)
    setStaffUsers(result.users ?? [])
  }

  useEffect(() => {
    loadCentres().catch((loadError) => setError(loadError.message))
  }, [])

  useEffect(() => {
    resetFormState()
    setError('')
    setNotice('')
  }, [mode])

  useEffect(() => {
    if (!form.selectedCentreId) {
      setForm((previous) => ({ ...previous, userIdPreview: '', selectedUserId: '' }))
      setStaffUsers([])
      return
    }

    if (mode === 'add') {
      requestWithScope(`/centre-users/preview-id?centreId=${encodeURIComponent(form.selectedCentreId)}`, user)
        .then((result) => {
          setForm((previous) => ({ ...previous, userIdPreview: result.user_id || '' }))
        })
        .catch(() => {
          setForm((previous) => ({ ...previous, userIdPreview: '' }))
        })
      return
    }

    loadStaff(form.selectedCentreId).catch(() => setStaffUsers([]))
    setForm((previous) => ({ ...previous, selectedUserId: '', userIdPreview: '', email: '' }))
  }, [mode, form.selectedCentreId])

  async function handleStaffSelection(userId) {
    setError('')
    setNotice('')
    if (!userId) {
      setForm((previous) => ({ ...previous, selectedUserId: '', email: '' }))
      return
    }

    try {
      const result = await requestWithScope(`/centre-users/${encodeURIComponent(userId)}`, user)
      setForm((previous) => ({
        ...previous,
        selectedUserId: result.user.user_id || '',
        email: result.user.email || '',
      }))
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

      resetFormState()
      await loadCentres()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save staff user right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Onboarding</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{mode === 'add' ? 'Add Staff' : 'Edit Staff'}</h2>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="staff-mode">Mode</label>
        <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="staff-mode" onChange={(event) => setMode(event.target.value)} value={mode}>
          <option value="add">ADD</option>
          <option value="edit">EDIT</option>
        </select>
      </div>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="staff-centre">Centre</label>
          <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="staff-centre" onChange={(event) => setForm((previous) => ({ ...previous, selectedCentreId: event.target.value }))} required value={form.selectedCentreId}>
            <option value="">Select centre</option>
            {centres.map((centre) => (
              <option key={centre.centre_id} value={centre.centre_id}>
                {centre.centre_id} - {centre.name}
              </option>
            ))}
          </select>
        </div>

        {mode === 'edit' && (
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="staff-select">Select staff</label>
            <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="staff-select" onChange={(event) => handleStaffSelection(event.target.value)} value={form.selectedUserId}>
              <option value="">Select staff</option>
              {staffUsers.map((staff) => (
                <option key={staff.user_id} value={staff.user_id}>
                  {staff.user_id} - {staff.email}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="staff-user-id">User ID</label>
          <input className="w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700" id="staff-user-id" readOnly value={mode === 'add' ? form.userIdPreview : form.selectedUserId} />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="staff-email">Email</label>
          <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="staff-email" onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} required type="email" value={form.email} />
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
        <button className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isSubmitting || !form.selectedCentreId || (mode === 'add' && !form.userIdPreview) || (mode === 'edit' && !form.selectedUserId)} type="submit">
          {isSubmitting ? 'Saving staff...' : mode === 'add' ? 'Create Staff User' : 'Update Staff User'}
        </button>
      </form>
    </section>
  )
}

export default StaffManagement
