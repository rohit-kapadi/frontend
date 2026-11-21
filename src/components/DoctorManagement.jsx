import { useEffect, useState } from 'react'
import { requestWithScope } from './managementApi.js'
import { useRealtimeSync } from './useRealtimeSync.js'

const defaultDoctorForm = {
  selectedDoctorId: '',
  doctorId: '',
  firstName: '',
  lastName: '',
  email: '',
  specialization: '',
  regNo: '',
  rate: '',
  doctorType: 'A',
  pinCode: '',
  address: '',
  signatureData: '',
  signatureLabel: '',
}

function DoctorManagement({ user }) {
  const [mode, setMode] = useState('add')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [doctors, setDoctors] = useState([])
  const [form, setForm] = useState(defaultDoctorForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadDoctors = async () => {
    const result = await requestWithScope('/doctors', user)
    setDoctors(result.doctors ?? [])
  }

  useEffect(() => {
    loadDoctors().catch((loadError) => setError(loadError.message))
  }, [])
  useRealtimeSync({ user, tables: ['doctors'], onChange: loadDoctors })

  async function handleDoctorSelection(selectedId) {
    setError('')
    setNotice('')
    try {
      const result = await requestWithScope(`/doctors/${encodeURIComponent(selectedId)}`, user)
      const doctor = result.doctor
      setMode('edit')
      setIsModalOpen(true)
      setForm({
        selectedDoctorId: doctor.doctor_id || '',
        doctorId: doctor.doctor_id || '',
        firstName: doctor.first_name || '',
        lastName: doctor.last_name || '',
        email: doctor.email || '',
        specialization: doctor.specialization || '',
        regNo: doctor.reg_no || '',
        rate: doctor.rate == null ? '' : String(doctor.rate),
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

  useEffect(() => {
    if (mode !== 'add' || !isModalOpen) return
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
  }, [form.firstName, form.lastName, form.doctorType, form.pinCode, isModalOpen, mode])

  async function handleSignatureUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Unable to read selected signature file.'))
      reader.readAsDataURL(file)
    })
    if (typeof dataUrl !== 'string') return
    setForm((previous) => ({
      ...previous,
      signatureData: dataUrl,
      signatureLabel: file.name,
    }))
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
      regNo: form.regNo,
      rate: form.rate,
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

      await loadDoctors()
      setIsModalOpen(false)
      setForm(defaultDoctorForm)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save doctor right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Doctors</h2>
        <button className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => { setMode('add'); setForm(defaultDoctorForm); setIsModalOpen(true) }} type="button">
          + Add Doctor
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-3 py-2">Doctor ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Specialization</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((doctor) => (
              <tr className="border-t border-slate-200" key={doctor.doctor_id}>
                <td className="px-3 py-2">{doctor.doctor_id}</td>
                <td className="px-3 py-2">{[doctor.first_name, doctor.last_name].filter(Boolean).join(' ')}</td>
                <td className="px-3 py-2">{doctor.email}</td>
                <td className="px-3 py-2">{doctor.specialization}</td>
                <td className="px-3 py-2">{doctor.rate == null ? '—' : doctor.rate}</td>
                <td className="px-3 py-2">
                  <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" onClick={() => handleDoctorSelection(doctor.doctor_id)} type="button">✎ Edit</button>
                </td>
              </tr>
            ))}
            {doctors.length === 0 && <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={6}>No doctors found.</td></tr>}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 px-3 py-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{mode === 'add' ? 'Add Doctor' : 'Edit Doctor'}</h3>
              <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => setIsModalOpen(false)} type="button">Close</button>
            </div>
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Doctor ID</label><input className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm" readOnly value={form.doctorId} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="mb-1 block text-xs font-medium text-slate-700">First name</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, firstName: event.target.value }))} required value={form.firstName} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Last name</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, lastName: event.target.value }))} required value={form.lastName} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Email</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} required type="email" value={form.email} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Specialization</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, specialization: event.target.value }))} required value={form.specialization} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Registration Number</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, regNo: event.target.value }))} required value={form.regNo} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Rate</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, rate: event.target.value }))} placeholder="e.g. 250" type="number" value={form.rate} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Doctor Type</label><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, doctorType: event.target.value }))} value={form.doctorType}><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Pincode</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={6} onChange={(event) => setForm((previous) => ({ ...previous, pinCode: event.target.value.replace(/\D/g, '') }))} required value={form.pinCode} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Digital signature</label><input accept="image/*" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={handleSignatureUpload} type="file" /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Address</label><textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))} required rows={2} value={form.address} /></div>
              {form.signatureLabel && <p className="text-xs text-slate-500">Signature: {form.signatureLabel}</p>}
              <div className="flex justify-end gap-2">
                <button className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setIsModalOpen(false)} type="button">Cancel</button>
                <button className="rounded bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" disabled={isSubmitting || (mode === 'edit' && !form.selectedDoctorId)} type="submit">
                  {isSubmitting ? 'Saving...' : mode === 'add' ? 'Create Doctor' : 'Update Doctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default DoctorManagement
