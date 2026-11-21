import { useEffect, useState } from 'react'
import { requestWithScope } from './managementApi.js'
import { useRealtimeSync } from './useRealtimeSync.js'

const defaultCentreForm = {
  selectedCentreId: '',
  name: '',
  address: '',
  pinCode: '',
  diagType: 'A',
  rate: '10.0',
  previewCentreId: '',
}

const defaultUserForm = {
  selectedUserId: '',
  email: '',
}

function CentreManagement({ user }) {
  const [mode, setMode] = useState('add')
  const [isCentreModalOpen, setIsCentreModalOpen] = useState(false)
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [userMode, setUserMode] = useState('add')
  const [centres, setCentres] = useState([])
  const [selectedCentreForUsers, setSelectedCentreForUsers] = useState('')
  const [centreUsers, setCentreUsers] = useState([])
  const [centreForm, setCentreForm] = useState(defaultCentreForm)
  const [userForm, setUserForm] = useState(defaultUserForm)
  const [userIdPreview, setUserIdPreview] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function loadCentres() {
    const result = await requestWithScope('/centres', user)
    setCentres(result.centres ?? [])
  }

  async function loadCentreUsers(centreId) {
    if (!centreId) {
      setCentreUsers([])
      return
    }
    const result = await requestWithScope(`/centre-users?centreId=${encodeURIComponent(centreId)}`, user)
    setCentreUsers(result.users ?? [])
  }

  useEffect(() => {
    loadCentres().catch((loadError) => setError(loadError.message))
  }, [])
  useRealtimeSync({ user, tables: ['diagnostic_centres', 'centre_users'], onChange: loadCentres })
  useEffect(() => { loadCentreUsers(selectedCentreForUsers).catch(() => setCentreUsers([])) }, [selectedCentreForUsers])

  useEffect(() => {
    if (!isCentreModalOpen || mode !== 'add') return
    if (!centreForm.name.trim() || !centreForm.diagType || !/^\d{6}$/.test(centreForm.pinCode)) {
      setCentreForm((previous) => ({ ...previous, previewCentreId: '' }))
      return
    }
    requestWithScope(
      `/centres/preview-id?name=${encodeURIComponent(centreForm.name)}&diagType=${encodeURIComponent(centreForm.diagType)}&pinCode=${encodeURIComponent(centreForm.pinCode)}`,
      user,
    )
      .then((result) => {
        setCentreForm((previous) => ({ ...previous, previewCentreId: result.centre_id || '' }))
      })
      .catch(() => {
        setCentreForm((previous) => ({ ...previous, previewCentreId: '' }))
      })
  }, [centreForm.name, centreForm.diagType, centreForm.pinCode, isCentreModalOpen, mode])

  useEffect(() => {
    if (!isUserModalOpen || userMode !== 'add' || !selectedCentreForUsers) return
    requestWithScope(`/centre-users/preview-id?centreId=${encodeURIComponent(selectedCentreForUsers)}`, user)
      .then((result) => setUserIdPreview(result.user_id || ''))
      .catch(() => setUserIdPreview(''))
  }, [isUserModalOpen, selectedCentreForUsers, userMode])

  async function openEditCentre(centreId) {
    try {
      const result = await requestWithScope(`/centres/${encodeURIComponent(centreId)}`, user)
      const centre = result.centre
      setMode('edit')
      setIsCentreModalOpen(true)
      setCentreForm({
        selectedCentreId: centre.centre_id || '',
        name: centre.name || '',
        address: centre.address || '',
        pinCode: centre.pin_code ? String(centre.pin_code) : '',
        diagType: (centre.diag_type || 'A').toUpperCase(),
        rate: centre.rate != null ? String(centre.rate) : '10.0',
        previewCentreId: centre.centre_id || '',
      })
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : 'Unable to load centre details right now.')
    }
  }

  async function openEditUser(userId) {
    try {
      const result = await requestWithScope(`/centre-users/${encodeURIComponent(userId)}`, user)
      setUserMode('edit')
      setUserIdPreview('')
      setUserForm({ selectedUserId: result.user.user_id || '', email: result.user.email || '' })
      setIsUserModalOpen(true)
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : 'Unable to load user details right now.')
    }
  }

  async function handleCentreSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    const payload = {
      name: centreForm.name,
      address: centreForm.address,
      pinCode: centreForm.pinCode,
      diagType: centreForm.diagType,
      rate: centreForm.rate,
    }
    try {
      if (mode === 'add') {
        const result = await requestWithScope('/centres', user, { method: 'POST', body: JSON.stringify(payload) })
        setNotice(`Centre created successfully with ID ${result.centre.centre_id}.`)
      } else {
        const result = await requestWithScope(`/centres/${encodeURIComponent(centreForm.selectedCentreId)}`, user, { method: 'PUT', body: JSON.stringify(payload) })
        setNotice(`Centre ${result.centre.centre_id} updated successfully.`)
      }
      setIsCentreModalOpen(false)
      setCentreForm(defaultCentreForm)
      await loadCentres()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save centre right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUserSubmit(event) {
    event.preventDefault()
    if (!selectedCentreForUsers) return
    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      if (userMode === 'add') {
        await requestWithScope('/centre-users', user, {
          method: 'POST',
          body: JSON.stringify({ centreId: selectedCentreForUsers, email: userForm.email }),
        })
        setNotice('Centre user created successfully.')
      } else {
        await requestWithScope(`/centre-users/${encodeURIComponent(userForm.selectedUserId)}`, user, {
          method: 'PUT',
          body: JSON.stringify({ centreId: selectedCentreForUsers, email: userForm.email }),
        })
        setNotice('Centre user updated successfully.')
      }
      setIsUserModalOpen(false)
      setUserForm(defaultUserForm)
      setUserIdPreview('')
      await loadCentreUsers(selectedCentreForUsers)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save centre user right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Diagnostic Centres</h2>
        <button className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => { setMode('add'); setCentreForm(defaultCentreForm); setIsCentreModalOpen(true) }} type="button">+ Add Centre</button>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-3 py-2">Centre ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Diag Type</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {centres.map((centre) => (
              <tr className="border-t border-slate-200" key={centre.centre_id}>
                <td className="px-3 py-2">{centre.centre_id}</td>
                <td className="px-3 py-2">{centre.name}</td>
                <td className="px-3 py-2">{centre.diag_type}</td>
                <td className="px-3 py-2">{centre.rate}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" onClick={() => openEditCentre(centre.centre_id)} type="button">✎ Edit</button>
                    <button className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50" onClick={() => setSelectedCentreForUsers(centre.centre_id)} type="button">Users</button>
                  </div>
                </td>
              </tr>
            ))}
            {centres.length === 0 && <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No centres found.</td></tr>}
          </tbody>
        </table>
      </div>

      {selectedCentreForUsers && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Users for Centre {selectedCentreForUsers}</h3>
            <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" onClick={() => { setUserMode('add'); setUserForm(defaultUserForm); setUserIdPreview(''); setIsUserModalOpen(true) }} type="button">+ Add User</button>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3 py-2">User ID</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {centreUsers.map((centreUser) => (
                  <tr className="border-t border-slate-200" key={centreUser.user_id}>
                    <td className="px-3 py-2">{centreUser.user_id}</td>
                    <td className="px-3 py-2">{centreUser.email}</td>
                    <td className="px-3 py-2"><button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" onClick={() => openEditUser(centreUser.user_id)} type="button">✎ Edit</button></td>
                  </tr>
                ))}
                {centreUsers.length === 0 && <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={3}>No users found for this centre.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isCentreModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 px-3 py-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">{mode === 'add' ? 'Add Centre' : 'Edit Centre'}</h3><button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => setIsCentreModalOpen(false)} type="button">Close</button></div>
            <form className="space-y-3" onSubmit={handleCentreSubmit}>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Centre ID</label><input className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm" readOnly value={centreForm.previewCentreId} /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Centre name</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setCentreForm((previous) => ({ ...previous, name: event.target.value }))} required value={centreForm.name} /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Address</label><textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setCentreForm((previous) => ({ ...previous, address: event.target.value }))} required rows={2} value={centreForm.address} /></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Pincode</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={6} onChange={(event) => setCentreForm((previous) => ({ ...previous, pinCode: event.target.value.replace(/\D/g, '') }))} required value={centreForm.pinCode} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Diag type</label><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setCentreForm((previous) => ({ ...previous, diagType: event.target.value }))} value={centreForm.diagType}><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Rate</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setCentreForm((previous) => ({ ...previous, rate: event.target.value }))} required type="number" value={centreForm.rate} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setIsCentreModalOpen(false)} type="button">Cancel</button>
                <button className="rounded bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" disabled={isSubmitting || (mode === 'edit' && !centreForm.selectedCentreId)} type="submit">{isSubmitting ? 'Saving...' : mode === 'add' ? 'Create Centre' : 'Update Centre'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isUserModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 px-3 py-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">{userMode === 'add' ? 'Add User' : 'Edit User'}</h3><button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => setIsUserModalOpen(false)} type="button">Close</button></div>
            <form className="space-y-3" onSubmit={handleUserSubmit}>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Centre</label><input className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm" readOnly value={selectedCentreForUsers} /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">User ID</label><input className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm" readOnly value={userMode === 'add' ? userIdPreview : userForm.selectedUserId} /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Email</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setUserForm((previous) => ({ ...previous, email: event.target.value }))} required type="email" value={userForm.email} /></div>
              <div className="flex justify-end gap-2">
                <button className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setIsUserModalOpen(false)} type="button">Cancel</button>
                <button className="rounded bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" disabled={isSubmitting || (userMode === 'add' && !userIdPreview)} type="submit">{isSubmitting ? 'Saving...' : userMode === 'add' ? 'Create User' : 'Update User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default CentreManagement
