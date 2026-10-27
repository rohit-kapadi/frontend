import { useEffect, useMemo, useState } from 'react'
import { requestWithScope } from './managementApi.js'

const MAX_SCAN_SIZE_BYTES = 5 * 1024 * 1024
const SCAN_SIZE_ERROR = 'Scan file exceeds 5 MB. Please upload a smaller file.'
const genderOptions = ['Male', 'Female', 'Other']
const modalityOptions = ['XRAY', 'ECG', 'CT', 'MRI']
const priorityOptions = [
  { label: 'Normal', value: 'normal' },
  { label: 'Emergency', value: 'emergency' },
]

const defaultForm = {
  patientFirstName: '',
  patientSurname: '',
  gender: genderOptions[0],
  ageYears: '',
  ageMonths: '',
  mobile: '',
  modality: modalityOptions[0],
  studyName: '',
  priority: 'normal',
  remark: '',
  selectedCentreId: '',
}

const adminRoles = ['admin', 'nexus_admin', 'group_admin']
const diagnosticCentreRoles = ['centre_user', 'centre_manager']

function NewCaseModal({ user, isOpen, onClose, onCreated }) {
  const [form, setForm] = useState(defaultForm)
  const [scanFile, setScanFile] = useState(null)
  const [scanFileError, setScanFileError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [centres, setCentres] = useState([])

  const normalizedRole = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : ''
  const isAdmin = adminRoles.includes(normalizedRole)
  const isDiagnosticUser = diagnosticCentreRoles.includes(normalizedRole)

  const selectedCentreId = useMemo(() => {
    if (isDiagnosticUser && typeof user?.centre_id === 'string' && user.centre_id.length > 0) {
      return user.centre_id
    }
    return form.selectedCentreId
  }, [form.selectedCentreId, isDiagnosticUser, user?.centre_id])

  useEffect(() => {
    if (!isOpen) return
    setForm((previous) => ({
      ...defaultForm,
      selectedCentreId: isDiagnosticUser ? user?.centre_id || '' : previous.selectedCentreId,
    }))
    setScanFile(null)
    setScanFileError('')
    setError('')
    setNotice('')
  }, [isOpen, isDiagnosticUser, user?.centre_id])

  useEffect(() => {
    if (!isOpen || !isAdmin) return

    requestWithScope('/centres', user)
      .then((result) => {
        const fetchedCentres = Array.isArray(result.centres) ? result.centres : []
        setCentres(fetchedCentres)
        setForm((previous) => ({
          ...previous,
          selectedCentreId: previous.selectedCentreId || fetchedCentres[0]?.centre_id || '',
        }))
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load centres right now.')
      })
  }, [isOpen, isAdmin, user])

  if (!isOpen) return null

  async function handleSubmit(event) {
    event.preventDefault()
    const shouldSubmit = event.nativeEvent.submitter?.value === 'submit'
    setError('')
    setNotice('')
    setScanFileError('')

    const years = Number(form.ageYears || 0)
    const months = Number(form.ageMonths || 0)

    if (!Number.isInteger(years) || years < 0 || years > 120) {
      setError('Age years must be a whole number between 0 and 120.')
      return
    }
    if (!Number.isInteger(months) || months < 0 || months > 11) {
      setError('Age months must be between 0 and 11.')
      return
    }
    if (!selectedCentreId) {
      setError('Please select a centre before creating the case.')
      return
    }
    if (form.mobile && !/^\d{10}$/.test(form.mobile)) {
      setError('Mobile number must be exactly 10 digits (numbers only).')
      return
    }
    if (!(scanFile instanceof File)) {
      setScanFileError('Scan image is required.')
      return
    }
    if (scanFile.size > MAX_SCAN_SIZE_BYTES) {
      setScanFileError(SCAN_SIZE_ERROR)
      return
    }

    setIsSubmitting(true)
    try {
      const payload = new FormData()
      payload.append('patientFirstName', form.patientFirstName.trim())
      payload.append('patientSurname', form.patientSurname.trim())
      payload.append('gender', form.gender)
      payload.append('ageYears', String(years))
      payload.append('ageMonths', String(months))
      payload.append('mobile', form.mobile.trim())
      payload.append('modality', form.modality)
      payload.append('studyName', form.studyName.trim())
      payload.append('priority', form.priority)
      payload.append('remark', form.remark.trim())
      payload.append('centreId', selectedCentreId)
      payload.append('submit', String(shouldSubmit))
      payload.append('scanFile', scanFile)

      const result = await requestWithScope('/cases', user, {
        method: 'POST',
        body: payload,
      })

      setNotice(`Case #${result.case?.case_id} ${shouldSubmit ? 'submitted' : 'saved as draft'} successfully.`)
      onCreated?.(result.case)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create case right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-3 py-4">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">New Case Intake</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Create Case</h2>
          </div>
          <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          {isAdmin && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-centre">Centre</label>
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-centre" onChange={(event) => setForm((previous) => ({ ...previous, selectedCentreId: event.target.value }))} required value={form.selectedCentreId}>
                <option value="">Select centre</option>
                {centres.map((centre) => (
                  <option key={centre.centre_id} value={centre.centre_id}>
                    {centre.centre_id} - {centre.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-first-name">Patient first name</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-first-name" onChange={(event) => setForm((previous) => ({ ...previous, patientFirstName: event.target.value }))} required value={form.patientFirstName} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-surname">Patient surname</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-surname" onChange={(event) => setForm((previous) => ({ ...previous, patientSurname: event.target.value }))} required value={form.patientSurname} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-gender">Gender</label>
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-gender" onChange={(event) => setForm((previous) => ({ ...previous, gender: event.target.value }))} required value={form.gender}>
                {genderOptions.map((gender) => (
                  <option key={gender} value={gender}>{gender}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-mobile">Mobile (optional)</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-mobile" maxLength={10} onChange={(event) => setForm((previous) => ({ ...previous, mobile: event.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10 digits" value={form.mobile} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-age-years">Age years</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-age-years" min={0} max={120} onChange={(event) => setForm((previous) => ({ ...previous, ageYears: event.target.value.replace(/[^\d]/g, '') }))} required type="number" value={form.ageYears} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-age-months">Age months</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-age-months" min={0} max={11} onChange={(event) => setForm((previous) => ({ ...previous, ageMonths: event.target.value.replace(/[^\d]/g, '') }))} required type="number" value={form.ageMonths} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-modality">Modality</label>
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-modality" onChange={(event) => setForm((previous) => ({ ...previous, modality: event.target.value }))} required value={form.modality}>
                {modalityOptions.map((modality) => (
                  <option key={modality} value={modality}>{modality}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-study-name">Study name</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-study-name" onChange={(event) => setForm((previous) => ({ ...previous, studyName: event.target.value }))} required value={form.studyName} />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Priority</p>
            <div className="flex flex-wrap gap-2">
              {priorityOptions.map((option) => (
                <label key={option.value} className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium ${form.priority === option.value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
                  <input checked={form.priority === option.value} className="sr-only" name="case-priority" onChange={() => setForm((previous) => ({ ...previous, priority: option.value }))} type="radio" value={option.value} />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-remark">Remark (optional)</label>
              <textarea className="h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-remark" onChange={(event) => setForm((previous) => ({ ...previous, remark: event.target.value }))} value={form.remark} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-scan">Investigation scan image</label>
              <input accept="image/*,.dcm,.pdf" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" id="case-scan" onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null
                setScanFile(selectedFile)
                setScanFileError('')
                if (selectedFile && selectedFile.size > MAX_SCAN_SIZE_BYTES) {
                  setScanFileError(SCAN_SIZE_ERROR)
                }
              }} required type="file" />
              <p className="mt-1 text-xs text-slate-500">Max file size: 5 MB.</p>
              {scanFile?.name && <p className="mt-1 text-xs text-slate-600">Selected: {scanFile.name}</p>}
              {scanFileError && <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{scanFileError}</p>}
            </div>
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

          <div className="flex items-center justify-end gap-2">
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-60" disabled={isSubmitting} type="submit" value="save">
              Save
            </button>
            <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isSubmitting} type="submit" value="submit">
              {isSubmitting ? 'Working...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NewCaseModal
