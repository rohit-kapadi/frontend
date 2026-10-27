import { useEffect, useState } from 'react'
import { requestWithScope } from './managementApi.js'

const defaultDoctorForm = {
  selectedDoctorId: '',
  doctorId: '',
  firstName: '',
  lastName: '',
  email: '',
  specialization: '',
  doctorType: 'A',
  pinCode: '',
  address: '',
  signatureData: '',
  signatureLabel: '',
}

function DoctorManagement({ user }) {
  const [mode, setMode] = useState('add')
  const [doctors, setDoctors] = useState([])
  const [form, setForm] = useState(defaultDoctorForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetFormState() {
    setForm(defaultDoctorForm)
  }

  async function loadDoctors() {
    const result = await requestWithScope('/doctors', user)
    setDoctors(result.doctors ?? [])
  }

  useEffect(() => {
    loadDoctors().catch((loadError) => setError(loadError.message))
  }, [])

  useEffect(() => {
    resetFormState()
    setError('')
    setNotice('')
  }, [mode])

  useEffect(() => {
    if (mode !== 'add') return
    if (!form.firstName.trim() || !form.lastName.trim() || !/^\d{6}$/.test(form.pinCode)) {
      setForm((previous) => ({ ...previous, doctorId: '' }))
      return
    }

    requestWithScope(
      `/doctors/preview-id?firstName=${encodeURIComponent(form.firstName)}&lastName=${encodeURIComponent(form.lastName)}&doctorType=${encodeURIComponent(form.doctorType)}&pinCode=${encodeURIComponent(form.pinCode)}`,
      user,
    )
      .then((result) => {
        setForm((previous) => ({ ...previous, doctorId: result.doctor_id || '' }))
      })
      .catch(() => {
        setForm((previous) => ({ ...previous, doctorId: '' }))
      })
  }, [mode, form.firstName, form.lastName, form.doctorType, form.pinCode])

  async function handleDoctorSelection(selectedId) {
    setError('')
    setNotice('')
    if (!selectedId) {
      resetFormState()
      return
    }

    try {
      const result = await requestWithScope(`/doctors/${encodeURIComponent(selectedId)}`, user)
      const doctor = result.doctor
      setForm({
        selectedDoctorId: doctor.doctor_id || '',
        doctorId: doctor.doctor_id || '',
        firstName: doctor.first_name || '',
        lastName: doctor.last_name || '',
        email: doctor.email || '',
        specialization: doctor.specialization || '',
        doctorType: (doctor.doctor_type || 'A').toUpperCase(),
        pinCode: doctor.pin_code != null ? String(doctor.pin_code) : '',
        address: doctor.address || '',
        signatureData: doctor.signature_data || '',
        signatureLabel: doctor.signature_data ? 'Signature loaded' : '',
      })
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : 'Unable to load doctor details right now.')
    }
  }

  async function handleSignatureUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const reader = new FileReader()
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Unable to read selected signature file.'))
        reader.readAsDataURL(file)
      })

      if (typeof dataUrl !== 'string') {
        throw new Error('Invalid signature data generated from file.')
      }

      setForm((previous) => ({
        ...previous,
        signatureData: dataUrl,
        signatureLabel: file.name,
      }))
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to load signature file right now.')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)

    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      specialization: form.specialization,
      doctorType: form.doctorType,
      pinCode: form.pinCode,
      address: form.address,
      signatureData: form.signatureData,
    }

    try {
      if (mode === 'add') {
        const result = await requestWithScope('/doctors', user, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setNotice(`Doctor ${result.doctor.doctor_id} created successfully.`)
      } else {
        const result = await requestWithScope(`/doctors/${encodeURIComponent(form.selectedDoctorId)}`, user, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        setNotice(`Doctor ${result.doctor.doctor_id} updated successfully.`)
      }

      resetFormState()
      await loadDoctors()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save doctor right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Onboarding</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{mode === 'add' ? 'Add Doctor' : 'Edit Doctor'}</h2>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-mode">Mode</label>
        <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-mode" onChange={(event) => setMode(event.target.value)} value={mode}>
          <option value="add">ADD</option>
          <option value="edit">EDIT</option>
        </select>
      </div>

      {mode === 'edit' && (
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-select">Select doctor</label>
          <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-select" onChange={(event) => handleDoctorSelection(event.target.value)} value={form.selectedDoctorId}>
            <option value="">Select doctor</option>
            {doctors.map((doctor) => (
              <option key={doctor.doctor_id} value={doctor.doctor_id}>
                {doctor.doctor_id} - {doctor.first_name} {doctor.last_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-id">Doctor ID</label>
          <input className="w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700" id="doctor-id" readOnly value={form.doctorId} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-first-name">First name</label>
            <div className="flex items-center rounded-xl border border-slate-300 focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-600/10">
              <span className="border-r border-slate-300 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700">Dr.</span>
              <input className="w-full rounded-r-xl px-4 py-3 text-sm outline-none" id="doctor-first-name" onChange={(event) => setForm((previous) => ({ ...previous, firstName: event.target.value }))} required value={form.firstName} />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-last-name">Last name</label>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-last-name" onChange={(event) => setForm((previous) => ({ ...previous, lastName: event.target.value }))} required value={form.lastName} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-email">Email</label>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-email" onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} required type="email" value={form.email} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-specialization">Specialization</label>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-specialization" onChange={(event) => setForm((previous) => ({ ...previous, specialization: event.target.value }))} value={form.specialization} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-type">Doctor type</label>
            <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-type" onChange={(event) => setForm((previous) => ({ ...previous, doctorType: event.target.value }))} value={form.doctorType}>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-pin-code">Pincode</label>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-pin-code" maxLength={6} minLength={6} onChange={(event) => setForm((previous) => ({ ...previous, pinCode: event.target.value.replace(/\D/g, '') }))} required value={form.pinCode} />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-signature">Digital signature</label>
          <input accept="image/*" className="w-full rounded-xl border border-slate-300 px-4 py-[0.62rem] text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-signature" onChange={handleSignatureUpload} type="file" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="doctor-address">Address</label>
          <textarea className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="doctor-address" onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))} required rows={3} value={form.address} />
        </div>

        {form.signatureLabel && <p className="text-xs text-slate-500">Signature: {form.signatureLabel}</p>}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
        <button className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isSubmitting || (mode === 'edit' && !form.selectedDoctorId)} type="submit">
          {isSubmitting ? 'Saving doctor...' : mode === 'add' ? 'Create Doctor' : 'Update Doctor'}
        </button>
      </form>
    </section>
  )
}

export default DoctorManagement
