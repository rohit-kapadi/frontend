import { useEffect, useMemo, useState } from 'react'
import { requestWithScope } from './managementApi.js'

const defaultCentreForm = {
  selectedCentreId: '',
  name: '',
  address: '',
  pinCode: '',
  diagType: 'A',
  rate: '10.0',
  previewCentreId: '',
}

function CentreManagement({ user }) {
  const [mode, setMode] = useState('add')
  const [centres, setCentres] = useState([])
  const [form, setForm] = useState(defaultCentreForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const modeLabel = useMemo(() => (mode === 'add' ? 'Add Centre' : 'Edit Centre'), [mode])

  function resetFormState() {
    setForm(defaultCentreForm)
  }

  async function loadCentres() {
    const result = await requestWithScope('/centres', user)
    setCentres(result.centres ?? [])
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
    if (mode !== 'add') return
    if (!form.name.trim() || !form.diagType || !/^\d{6}$/.test(form.pinCode)) {
      setForm((previous) => ({ ...previous, previewCentreId: '' }))
      return
    }

    requestWithScope(
      `/centres/preview-id?name=${encodeURIComponent(form.name)}&diagType=${encodeURIComponent(form.diagType)}&pinCode=${encodeURIComponent(form.pinCode)}`,
      user,
    )
      .then((result) => {
        setForm((previous) => ({ ...previous, previewCentreId: result.centre_id || '' }))
      })
      .catch(() => {
        setForm((previous) => ({ ...previous, previewCentreId: '' }))
      })
  }, [mode, form.name, form.diagType, form.pinCode])

  async function handleCentreSelection(centreId) {
    setError('')
    setNotice('')
    if (!centreId) {
      resetFormState()
      return
    }

    try {
      const result = await requestWithScope(`/centres/${encodeURIComponent(centreId)}`, user)
      const centre = result.centre
      setForm({
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

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)

    const payload = {
      name: form.name,
      address: form.address,
      pinCode: form.pinCode,
      diagType: form.diagType,
      rate: form.rate,
    }

    try {
      if (mode === 'add') {
        const result = await requestWithScope('/centres', user, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setNotice(`Centre created successfully with ID ${result.centre.centre_id}.`)
      } else {
        const result = await requestWithScope(`/centres/${encodeURIComponent(form.selectedCentreId)}`, user, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        setNotice(`Centre ${result.centre.centre_id} updated successfully.`)
      }

      resetFormState()
      await loadCentres()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save centre right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Onboarding</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{modeLabel}</h2>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="centre-mode">Mode</label>
        <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="centre-mode" onChange={(event) => setMode(event.target.value)} value={mode}>
          <option value="add">ADD</option>
          <option value="edit">EDIT</option>
        </select>
      </div>

      {mode === 'edit' && (
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="centre-select">Select centre</label>
          <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="centre-select" onChange={(event) => handleCentreSelection(event.target.value)} value={form.selectedCentreId}>
            <option value="">Select centre</option>
            {centres.map((centre) => (
              <option key={centre.centre_id} value={centre.centre_id}>
                {centre.centre_id} - {centre.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="centre-generated-id">Centre ID</label>
          <input className="w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700" id="centre-generated-id" readOnly value={form.previewCentreId} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="centre-name">Centre name</label>
          <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="centre-name" onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} required value={form.name} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="centre-address">Address</label>
          <textarea className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="centre-address" onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))} required rows={3} value={form.address} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="centre-pin">Pincode</label>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="centre-pin" maxLength={6} minLength={6} onChange={(event) => setForm((previous) => ({ ...previous, pinCode: event.target.value.replace(/\D/g, '') }))} required value={form.pinCode} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="centre-diag-type">Diag type</label>
            <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="centre-diag-type" onChange={(event) => setForm((previous) => ({ ...previous, diagType: event.target.value }))} value={form.diagType}>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="centre-rate">Rate</label>
          <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="centre-rate" onChange={(event) => setForm((previous) => ({ ...previous, rate: event.target.value }))} required type="number" value={form.rate} />
        </div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
        <button className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isSubmitting || (mode === 'edit' && !form.selectedCentreId)} type="submit">
          {isSubmitting ? 'Saving centre...' : mode === 'add' ? 'Create Centre' : 'Update Centre'}
        </button>
      </form>
    </section>
  )
}

export default CentreManagement
