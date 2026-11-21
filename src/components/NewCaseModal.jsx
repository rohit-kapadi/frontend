import { useEffect, useMemo, useState } from 'react'
import { requestWithScope } from './managementApi.js'

const MAX_SCAN_SIZE_BYTES = 5 * 1024 * 1024
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
  status: 'Draft',
  assignedDoctorId: '',
}

const adminRoles = ['admin', 'nexus_admin', 'group_admin']
const diagnosticCentreRoles = ['centre_user', 'centre_manager']

const toPriorityInput = (value) => (String(value || '').toLowerCase() === 'emergency' ? 'emergency' : 'normal')

const mapCaseToForm = (caseItem, fallbackCentreId) => ({
  patientFirstName: caseItem?.patient_first_name || '',
  patientSurname: caseItem?.patient_surname || '',
  gender: genderOptions.includes(caseItem?.gender) ? caseItem.gender : genderOptions[0],
  ageYears: caseItem?.age_year == null ? '' : String(caseItem.age_year),
  ageMonths: caseItem?.age_month == null ? '' : String(caseItem.age_month),
  mobile: caseItem?.mobile || '',
  modality: modalityOptions.includes(caseItem?.modality) ? caseItem.modality : modalityOptions[0],
  studyName: caseItem?.study_name || '',
  priority: toPriorityInput(caseItem?.priority),
  remark: caseItem?.remark || '',
  selectedCentreId: caseItem?.centre_id || fallbackCentreId || '',
  status: caseItem?.status || 'Draft',
  assignedDoctorId: caseItem?.assigned_doctor_id || '',
})

const adminStatusOptions = ['Draft', 'Unassigned', 'Assigned', 'Reverted', 'Reopened', 'Submitted']
const patientNameMaxLength = 30
const studyNameMaxLength = 50
const remarksMaxLength = 1000

const getRemainingHint = (value, maxLength) => {
  const currentLength = String(value || '').length
  if (currentLength < Math.ceil(maxLength * 0.75)) return ''
  return `${maxLength - currentLength} characters remaining`
}

function NewCaseModal({ user, isOpen, onClose, onCreated, onUpdated, onReopened, onDeleted, mode = 'create', initialCase = null }) {
  const [form, setForm] = useState(defaultForm)
  const [scanFiles, setScanFiles] = useState([])
  const [reopenMessage, setReopenMessage] = useState('')
  const [scanFileError, setScanFileError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [centres, setCentres] = useState([])
  const [doctors, setDoctors] = useState([])
  const [existingAttachments, setExistingAttachments] = useState([])
  const [isAttachmentsLoading, setIsAttachmentsLoading] = useState(false)

  const normalizedRole = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : ''
  const isAdmin = adminRoles.includes(normalizedRole)
  const isDiagnosticUser = diagnosticCentreRoles.includes(normalizedRole)
  const isEditMode = mode === 'edit'
  const isReopenMode = mode === 'reopen'
  const isUpdateMode = isEditMode || isReopenMode

  const selectedCentreId = useMemo(() => {
    if (isDiagnosticUser && typeof user?.centre_id === 'string' && user.centre_id.length > 0) {
      return user.centre_id
    }
    return form.selectedCentreId
  }, [form.selectedCentreId, isDiagnosticUser, user?.centre_id])

  useEffect(() => {
    if (!isOpen) return
    const prefill = isUpdateMode
      ? mapCaseToForm(initialCase, isDiagnosticUser ? user?.centre_id || '' : '')
      : { ...defaultForm, selectedCentreId: isDiagnosticUser ? user?.centre_id || '' : '' }
    setForm(prefill)
    setReopenMessage('')
    setScanFiles([])
    setScanFileError('')
    setError('')
    setNotice('')
    setExistingAttachments([])
  }, [initialCase, isDiagnosticUser, isOpen, isUpdateMode, user?.centre_id])

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
  }, [isAdmin, isOpen, user])

  useEffect(() => {
    if (!isOpen || !isAdmin) return
    requestWithScope('/doctors', user)
      .then((result) => {
        const fetchedDoctors = Array.isArray(result.doctors) ? result.doctors : []
        setDoctors(fetchedDoctors)
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load doctors right now.')
      })
  }, [isAdmin, isOpen, user])

  useEffect(() => {
    if (!isOpen || !isUpdateMode || !initialCase?.case_id) return
    let mounted = true
    setIsAttachmentsLoading(true)
    requestWithScope(`/cases/${encodeURIComponent(String(initialCase.case_id))}/attachments`, user)
      .then((result) => {
        if (!mounted) return
        setExistingAttachments(Array.isArray(result.attachments) ? result.attachments : [])
      })
      .catch((loadError) => {
        if (!mounted) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load existing attachments right now.')
      })
      .finally(() => {
        if (!mounted) return
        setIsAttachmentsLoading(false)
      })
    return () => { mounted = false }
  }, [initialCase?.case_id, isOpen, isUpdateMode, user])

  if (!isOpen) return null

  const validateScanFiles = (files) => {
    if (files.some((file) => file.size > MAX_SCAN_SIZE_BYTES)) {
      setScanFileError('One or more files exceed 5 MB.')
      return false
    }
    setScanFileError('')
    return true
  }

  const onScanSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    setScanFiles(selectedFiles)
    validateScanFiles(selectedFiles)
  }

  async function handleDeleteAttachment(attachmentId) {
    if (!initialCase?.case_id) return
    setError('')
    try {
      await requestWithScope(
        `/cases/${encodeURIComponent(String(initialCase.case_id))}/attachments/${encodeURIComponent(String(attachmentId))}`,
        user,
        { method: 'DELETE' },
      )
      setExistingAttachments((previous) => previous.filter((entry) => entry.attachment_id !== attachmentId))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete attachment right now.')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const submitAction = event.nativeEvent.submitter?.value
    const shouldSubmit = submitAction === 'submit'
    setError('')
    setNotice('')
    setScanFileError('')

    const years = Number(form.ageYears || 0)
    const months = Number(form.ageMonths || 0)
    if (!Number.isInteger(years) || years < 0 || years > 100) {
      setError('Age years must be a whole number between 0 and 100.')
      return
    }
    if (!Number.isInteger(months) || months < 0 || months > 11) {
      setError('Age months must be between 0 and 11.')
      return
    }
    if (!selectedCentreId) {
      setError(`Please select a centre before ${isUpdateMode ? 'updating' : 'creating'} the case.`)
      return
    }
    if (form.mobile && !/^\d{10}$/.test(form.mobile)) {
      setError('Mobile number must be exactly 10 digits (numbers only).')
      return
    }
    if (!form.studyName.trim()) {
      setError('Study name is required.')
      return
    }
    if (form.patientFirstName.trim().length > patientNameMaxLength || form.patientSurname.trim().length > patientNameMaxLength) {
      setError('Patient first name and surname cannot exceed 30 characters each.')
      return
    }
    if (form.studyName.trim().length > studyNameMaxLength) {
      setError('Study name cannot exceed 50 characters.')
      return
    }
    if (form.remark.trim().length > remarksMaxLength) {
      setError('Remark cannot exceed 1000 characters.')
      return
    }
    if (!isUpdateMode && scanFiles.length === 0) {
      setScanFileError('At least one scan file is required.')
      return
    }
    if (!validateScanFiles(scanFiles)) return
    if (isReopenMode && !reopenMessage.trim()) {
      setError('Reopen message is required.')
      return
    }

    if (isAdmin && isEditMode && form.status === 'Assigned' && !form.assignedDoctorId.trim()) {
      setError('Assigned status requires selecting a doctor.')
      return
    }

    const statusChanged = isAdmin && isEditMode && String(form.status || '') !== String(initialCase?.status || '')
    const assigneeChanged = isAdmin && isEditMode && String(form.assignedDoctorId || '') !== String(initialCase?.assigned_doctor_id || '')
    if ((statusChanged || assigneeChanged) && !window.confirm('You are about to change the case status or assigned doctor. This can affect case ownership and workflow visibility. Do you want to continue?')) {
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
      payload.append('reopenCase', String(isReopenMode))
      payload.append('reopenMessage', reopenMessage.trim())
      if (isAdmin && isEditMode) {
        payload.append('status', form.status)
        payload.append('assignedDoctorId', form.assignedDoctorId.trim())
      }
      scanFiles.forEach((file) => payload.append('scanFiles', file))

      const path = isUpdateMode ? `/cases/${encodeURIComponent(String(initialCase?.case_id || ''))}` : '/cases'
      const method = isUpdateMode ? 'PUT' : 'POST'
      const result = await requestWithScope(path, user, { method, body: payload })
      const successNotice = isReopenMode
        ? `Case #${result.case?.case_id} is reopened.`
        : isEditMode
          ? `Case #${result.case?.case_id} updated successfully.`
          : `Case #${result.case?.case_id} ${shouldSubmit ? 'submitted' : 'saved as draft'} successfully.`
      setNotice(successNotice)

      if (isReopenMode) onReopened?.(result.case)
      else if (isEditMode) onUpdated?.(result.case)
      else onCreated?.(result.case)
    } catch (submitError) {
      const operation = isReopenMode ? 'reopen' : isEditMode ? 'update' : 'create'
      setError(submitError instanceof Error ? submitError.message : `Unable to ${operation} case right now.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteCase() {
    if (!isAdmin || !isEditMode || !initialCase?.case_id) return
    const confirmed = window.confirm('Archive this case? This will hide it from all user views.')
    if (!confirmed) return

    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      const result = await requestWithScope(`/cases/${encodeURIComponent(String(initialCase.case_id))}`, user, { method: 'DELETE' })
      onDeleted?.({ case_id: initialCase.case_id, message: result.message })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete case right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-3 py-4">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{isReopenMode ? 'Reopen Case' : isEditMode ? 'Case Update' : 'New Case Intake'}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{isReopenMode ? 'Edit & Reopen Case' : isEditMode ? 'Edit Case' : 'Create Case'}</h2>
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
                  <option key={centre.centre_id} value={centre.centre_id}>{centre.centre_id} - {centre.name}</option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && isEditMode && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-status">Status</label>
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-status" onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))} value={form.status}>
                  {adminStatusOptions.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>{statusOption}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="case-doctor">Assigned doctor</label>
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" id="case-doctor" onChange={(event) => setForm((previous) => ({ ...previous, assignedDoctorId: event.target.value }))} value={form.assignedDoctorId}>
                  <option value="">Unassigned</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.doctor_id} value={doctor.doctor_id}>
                      {doctor.doctor_id} - {[doctor.first_name, doctor.last_name].filter(Boolean).join(' ').trim() || doctor.email || doctor.doctor_id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Patient first name</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" maxLength={patientNameMaxLength} onChange={(event) => setForm((previous) => ({ ...previous, patientFirstName: event.target.value }))} required value={form.patientFirstName} />
              {getRemainingHint(form.patientFirstName, patientNameMaxLength) && <p className="mt-1 text-xs text-amber-700">{getRemainingHint(form.patientFirstName, patientNameMaxLength)}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Patient surname</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" maxLength={patientNameMaxLength} onChange={(event) => setForm((previous) => ({ ...previous, patientSurname: event.target.value }))} required value={form.patientSurname} />
              {getRemainingHint(form.patientSurname, patientNameMaxLength) && <p className="mt-1 text-xs text-amber-700">{getRemainingHint(form.patientSurname, patientNameMaxLength)}</p>}
            </div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Gender</label><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" onChange={(event) => setForm((previous) => ({ ...previous, gender: event.target.value }))} required value={form.gender}>{genderOptions.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</select></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Mobile (optional)</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" maxLength={10} onChange={(event) => setForm((previous) => ({ ...previous, mobile: event.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10 digits" value={form.mobile} /></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Age years</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" min={0} max={100} onChange={(event) => setForm((previous) => ({ ...previous, ageYears: event.target.value.replace(/[^\d]/g, '').slice(0, 3) }))} required type="number" value={form.ageYears} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Age months</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" min={0} max={11} onChange={(event) => setForm((previous) => ({ ...previous, ageMonths: event.target.value.replace(/[^\d]/g, '') }))} required type="number" value={form.ageMonths} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Modality</label><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" onChange={(event) => setForm((previous) => ({ ...previous, modality: event.target.value }))} required value={form.modality}>{modalityOptions.map((modality) => <option key={modality} value={modality}>{modality}</option>)}</select></div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">Study name</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" maxLength={studyNameMaxLength} onChange={(event) => setForm((previous) => ({ ...previous, studyName: event.target.value }))} required value={form.studyName} />
              {getRemainingHint(form.studyName, studyNameMaxLength) && <p className="mt-1 text-xs text-amber-700">{getRemainingHint(form.studyName, studyNameMaxLength)}</p>}
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
              <label className="mb-1 block text-xs font-medium text-slate-700">Remark (optional)</label>
              <textarea className="h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" maxLength={remarksMaxLength} onChange={(event) => setForm((previous) => ({ ...previous, remark: event.target.value }))} value={form.remark} />
              {getRemainingHint(form.remark, remarksMaxLength) && <p className="mt-1 text-xs text-amber-700">{getRemainingHint(form.remark, remarksMaxLength)}</p>}
            </div>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Investigation scan image {isUpdateMode ? '(optional)' : ''}</label>
                <input accept="image/*,.dcm,.pdf" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" multiple onChange={onScanSelection} required={!isUpdateMode} type="file" />
                <p className="mt-1 text-xs text-slate-500">Multi-select supported. Max file size: 5 MB each.</p>
                {scanFiles.length > 0 && <p className="mt-1 text-xs text-slate-600">Selected: {scanFiles.map((file) => file.name).join(', ')}</p>}
                {scanFileError && <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{scanFileError}</p>}
              </div>
              {isUpdateMode && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-700">Existing attachments</p>
                  {isAttachmentsLoading && <p className="text-xs text-slate-500">Loading attachments...</p>}
                  {!isAttachmentsLoading && existingAttachments.length === 0 && <p className="text-xs text-slate-500">No attachments found.</p>}
                  {!isAttachmentsLoading && existingAttachments.length > 0 && (
                    <div className="flex max-h-28 flex-wrap gap-2 overflow-auto rounded-lg border border-slate-200 p-2">
                      {existingAttachments.map((attachment) => (
                        <span key={attachment.attachment_id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                          {attachment.file_name || attachment.file_url}
                          <button className="text-red-600 hover:text-red-700" onClick={() => handleDeleteAttachment(attachment.attachment_id)} title="Delete attachment" type="button">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {isReopenMode && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Reopen message</label>
              <textarea className="h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" onChange={(event) => setReopenMessage(event.target.value)} placeholder="Explain why the case is being reopened" required value={reopenMessage} />
            </div>
          )}
          {!isReopenMode && isEditMode && initialCase?.reject_remark && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Reopen Remark</label>
              <textarea className="h-20 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value={initialCase.reject_remark} />
            </div>
          )}

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

          <div className="flex items-center justify-between gap-2">
            <div>
              {isAdmin && isEditMode && (
                <button className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60" disabled={isSubmitting} onClick={handleDeleteCase} type="button">
                  Archive Case
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" onClick={onClose} type="button">Cancel</button>
            {!isReopenMode && (
              <>
                <button className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-60" disabled={isSubmitting} type="submit" value="save">Save</button>
                <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isSubmitting} type="submit" value="submit">{isSubmitting ? 'Working...' : 'Submit'}</button>
              </>
            )}
            {isReopenMode && <button className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60" disabled={isSubmitting} type="submit" value="reopen">{isSubmitting ? 'Working...' : 'Reopen Case'}</button>}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NewCaseModal
