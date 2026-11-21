import { useCallback, useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { requestWithScope } from './managementApi.js'
import MultiSelectDropdown from './MultiSelectDropdown.jsx'
import { useRealtimeSync } from './useRealtimeSync.js'

const modalityFilterOptions = ['XRAY', 'CT', 'MRI', 'ECG']
const activeStatuses = ['Draft', 'Unassigned', 'Assigned', 'Reverted', 'Reopened']
const historyStatuses = ['Submitted']
const defaultSort = { key: 'priority', direction: 'asc' }
const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const reportDisclaimer = 'Disclaimer: The science of radiology is based upon interpretation of shadows of normal and abnormal tissue. This is neither complete nor accurate; hence, findings should always be interpreted in the light of clinico-pathological correlation. This is a professional opinion, not a final diagnosis. Not meant for medico-legal purposes.'

const isEmergencyPriority = (priority) => String(priority || '').toLowerCase() === 'emergency'
const formatPatientName = (caseItem) => [caseItem?.patient_first_name, caseItem?.patient_surname].filter(Boolean).join(' ').trim()

const formatTimestamp = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = String(date.getDate()).padStart(2, '0')
  const month = monthShort[date.getMonth()] || 'Jan'
  const year = date.getFullYear()
  let hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const amPm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${day}-${month}-${year}, ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${amPm}`
}

const formatReportTimestamp = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = String(date.getDate()).padStart(2, '0')
  const month = monthShort[date.getMonth()] || 'Jan'
  const year = date.getFullYear()
  let hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const amPm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${day}-${month}-${year} ${String(hours).padStart(2, '0')}:${minutes} ${amPm}`
}

const parseStoredCaseIds = (value) => {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry))
  } catch {
    return []
  }
}

function IconButton({ label, onClick, children, className = '', disabled = false }) {
  return (
    <button
      aria-label={label}
      className={`rounded-md border border-slate-300 p-1.5 text-slate-600 transition hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function CaseManagementTable({ user, notice, reloadKey, onEditCase, onReopenCase, onAddCase }) {
  const [cases, setCases] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [localNotice, setLocalNotice] = useState('')
  const [searchText, setSearchText] = useState('')
  const [modalityFilters, setModalityFilters] = useState([])
  const [statusFilters, setStatusFilters] = useState([])
  const [sortConfig, setSortConfig] = useState(defaultSort)
  const [activeTab, setActiveTab] = useState('active')
  const [ignoredCaseIds, setIgnoredCaseIds] = useState([])
  const [interactedCaseIds, setInteractedCaseIds] = useState([])
  const [rejectModalCase, setRejectModalCase] = useState(null)
  const [rejectRemarkInput, setRejectRemarkInput] = useState('')
  const [isRejectSubmitting, setIsRejectSubmitting] = useState(false)
  const [attachmentModalCase, setAttachmentModalCase] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [selectedAttachmentIndex, setSelectedAttachmentIndex] = useState(0)
  const [isAttachmentLoading, setIsAttachmentLoading] = useState(false)
  const [doctorWorkCase, setDoctorWorkCase] = useState(null)
  const [doctorFindingsInput, setDoctorFindingsInput] = useState('')
  const [doctorImpressionInput, setDoctorImpressionInput] = useState('')
  const [doctorWorkValidationError, setDoctorWorkValidationError] = useState('')
  const [isDoctorWorkSubmitting, setIsDoctorWorkSubmitting] = useState(false)
  const [reportPreviewCase, setReportPreviewCase] = useState(null)
  const [reportPreviewUrl, setReportPreviewUrl] = useState('')
  const [reportPreviewName, setReportPreviewName] = useState('')
  const [isReportPreviewLoading, setIsReportPreviewLoading] = useState(false)
  const [reportPreviewError, setReportPreviewError] = useState('')

  const normalizedRole = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : ''
  const isDoctorView = normalizedRole === 'doctor'
  const isCentreUser = ['centre_user', 'centre_manager'].includes(normalizedRole)
  const currentUserId = user?.id || ''
  const ignoredCasesStorageKey = `caseIgnore:${user?.nexus_id || ''}:${currentUserId}`

  const showStatusColumn = activeTab !== 'history'
  const showStatusFilter = activeTab !== 'history'
  const totalColumns = showStatusColumn ? 10 : 9
  const effectiveNotice = localNotice || notice
  const isCaseVisibleForUser = useCallback((caseItem) => {
    if (!caseItem || String(caseItem.status || '') === 'Archived') return false
    if (isCentreUser) {
      return String(caseItem.centre_id || '') === String(user?.centre_id || '')
    }
    if (isDoctorView) {
      const status = String(caseItem?.status || '')
      if (status === 'Unassigned') return true
      if (['Assigned', 'Submitted', 'Reopened'].includes(status)) {
        return String(caseItem?.assigned_doctor_id || '') === String(currentUserId || '')
      }
      return false
    }
    return true
  }, [currentUserId, isCentreUser, isDoctorView, user?.centre_id])

  const reloadCases = useCallback(() => {
    let mounted = true
    setIsLoading(true)
    setError('')
    requestWithScope('/cases', user)
      .then((result) => {
        if (!mounted) return
        setCases(Array.isArray(result.cases) ? result.cases : [])
      })
      .catch((loadError) => {
        if (!mounted) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load case list right now.')
      })
      .finally(() => {
        if (!mounted) return
        setIsLoading(false)
      })
    return () => { mounted = false }
  }, [user])

  useEffect(() => reloadCases(), [reloadCases, reloadKey])
  const handleRealtimeCaseChange = useCallback((payload) => {
    const nextCase = payload?.new || {}
    const previousCase = payload?.old || {}
    const caseId = Number(nextCase.case_id || previousCase.case_id)
    if (!Number.isInteger(caseId)) return
    setCases((previous) => {
      if (payload?.eventType === 'DELETE') {
        return previous.filter((entry) => Number(entry.case_id) !== caseId)
      }
      if (!isCaseVisibleForUser(nextCase)) {
        return previous.filter((entry) => Number(entry.case_id) !== caseId)
      }
      const hasExisting = previous.some((entry) => Number(entry.case_id) === caseId)
      if (hasExisting) {
        return previous.map((entry) => (Number(entry.case_id) === caseId ? { ...entry, ...nextCase } : entry))
      }
      return [{ ...nextCase }, ...previous]
    })
    reloadCases()
  }, [isCaseVisibleForUser, reloadCases])
  useRealtimeSync({ user, tables: ['cases'], onChange: handleRealtimeCaseChange })

  useEffect(() => {
    if (!isDoctorView) {
      setIgnoredCaseIds([])
      return
    }
    setIgnoredCaseIds(parseStoredCaseIds(localStorage.getItem(ignoredCasesStorageKey)))
  }, [ignoredCasesStorageKey, isDoctorView])

  useEffect(() => {
    if (!isDoctorView) return
    localStorage.setItem(ignoredCasesStorageKey, JSON.stringify(ignoredCaseIds))
  }, [ignoredCaseIds, ignoredCasesStorageKey, isDoctorView])

  const statusFilterOptions = useMemo(() => {
    if (activeTab === 'history') return historyStatuses
    if (isDoctorView) return ['Unassigned', 'Assigned', 'Reopened']
    return activeStatuses
  }, [activeTab, isDoctorView])

  const filteredAndSortedCases = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    const tabStatuses = activeTab === 'history' ? historyStatuses : activeStatuses
    const rows = cases.filter((caseItem) => {
      const status = String(caseItem?.status || '')
      if (!tabStatuses.includes(status)) return false
      if (isDoctorView && ['Assigned', 'Submitted', 'Reopened'].includes(status) && String(caseItem.assigned_doctor_id || '') !== String(currentUserId || '')) return false
      if (isDoctorView && !['Unassigned', 'Assigned', 'Submitted', 'Reopened'].includes(status)) return false

      const searchable = [
        formatPatientName(caseItem),
        String(caseItem.case_id || ''),
        String(caseItem.study_name || ''),
        String(caseItem.remark || ''),
        String(caseItem.reject_remark || ''),
        String(caseItem.centre_name || ''),
      ].join(' ').toLowerCase()
      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false
      if (modalityFilters.length > 0 && !modalityFilters.includes(String(caseItem.modality || '').toUpperCase())) return false
      if (showStatusFilter && statusFilters.length > 0 && !statusFilters.includes(status)) return false
      if (isDoctorView && activeTab === 'active' && ignoredCaseIds.includes(Number(caseItem.case_id)) && !normalizedSearch) return false
      return true
    })

    const getComparable = (caseItem, key) => {
      if (key === 'case_id') return Number(caseItem.case_id || 0)
      if (key === 'patient_name') return formatPatientName(caseItem).toLowerCase()
      if (key === 'gender') return String(caseItem.gender || '').toLowerCase()
      if (key === 'contact') return isDoctorView ? String(caseItem.centre_name || '').toLowerCase() : String(caseItem.mobile || '')
      if (key === 'modality') return String(caseItem.modality || '').toLowerCase()
      if (key === 'study_name') return String(caseItem.study_name || '').toLowerCase()
      if (key === 'status') return String(caseItem.status || '').toLowerCase()
      if (key === 'submit_date') return new Date(caseItem.completed_at || caseItem.submitted_at || caseItem.created_at || 0).getTime()
      if (key === 'priority') return isEmergencyPriority(caseItem.priority) ? 0 : 1
      return ''
    }

    return [...rows].sort((left, right) => {
      const leftValue = getComparable(left, sortConfig.key)
      const rightValue = getComparable(right, sortConfig.key)
      let compare = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue))
      if (compare === 0) {
        compare = new Date(right.completed_at || right.submitted_at || right.created_at || 0).getTime() - new Date(left.completed_at || left.submitted_at || left.created_at || 0).getTime()
      }
      return sortConfig.direction === 'asc' ? compare : -compare
    })
  }, [activeTab, cases, currentUserId, ignoredCaseIds, isDoctorView, modalityFilters, searchText, showStatusFilter, sortConfig, statusFilters])

  const setQuickSort = (value) => {
    if (value === 'patient') setSortConfig({ key: 'patient_name', direction: 'asc' })
    else if (value === 'newest') setSortConfig({ key: 'submit_date', direction: 'desc' })
    else setSortConfig({ key: 'priority', direction: 'asc' })
  }

  const toggleSort = (columnKey) => {
    setSortConfig((previous) => {
      if (previous.key === columnKey) return { key: columnKey, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      return { key: columnKey, direction: 'asc' }
    })
  }

  const sortIcon = (columnKey) => (sortConfig.key !== columnKey ? '↕' : sortConfig.direction === 'asc' ? '▲' : '▼')

  const markInteracted = (caseId) => {
    if (interactedCaseIds.includes(caseId)) return
    setInteractedCaseIds((previous) => [...previous, caseId])
  }

  async function runDoctorAction(caseItem, action, remark = '') {
    const caseId = Number(caseItem.case_id)
    markInteracted(caseId)

    if (action === 'ignore') {
      if (!ignoredCaseIds.includes(caseId)) {
        setIgnoredCaseIds((previous) => [...previous, caseId])
      }
      setLocalNotice(`Case #${caseId} has been ignored.`)
      return
    }
    if (action === 'restore') {
      setIgnoredCaseIds((previous) => previous.filter((entry) => entry !== caseId))
      return
    }

    try {
      const result = await requestWithScope(`/cases/${encodeURIComponent(String(caseId))}/doctor-action`, user, {
        method: 'PATCH',
        body: JSON.stringify({ action, remark }),
      })
      setCases((previous) => previous.map((entry) => (entry.case_id === result.case.case_id ? { ...entry, ...result.case } : entry)))
      setLocalNotice(`Case #${result.case.case_id} has been updated.`)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update case action right now.')
    }
  }

  async function submitRejectRemark() {
    if (!rejectModalCase) return
    const remark = rejectRemarkInput.trim()
    if (!remark) {
      setError('Rejection remark is required to reject a case.')
      return
    }
    setIsRejectSubmitting(true)
    try {
      await runDoctorAction(rejectModalCase, 'reject', remark)
      setRejectModalCase(null)
      setRejectRemarkInput('')
    } finally {
      setIsRejectSubmitting(false)
    }
  }

  async function openAttachmentViewer(caseItem) {
    setError('')
    setAttachmentModalCase(caseItem)
    setAttachments([])
    setSelectedAttachmentIndex(0)
    setIsAttachmentLoading(true)
    try {
      const result = await requestWithScope(`/cases/${encodeURIComponent(String(caseItem.case_id))}/attachments`, user)
      setAttachments(Array.isArray(result.attachments) ? result.attachments : [])
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : 'Unable to load attachments right now.')
      setAttachmentModalCase(null)
    } finally {
      setIsAttachmentLoading(false)
    }
  }

  const buildCaseReportPdf = async (reportData) => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = 210
    const pageHeight = 297
    const left = 14
    const right = 14
    const contentWidth = pageWidth - left - right
    const drawTextValue = (value) => (value == null || String(value).trim() === '' ? '—' : String(value).trim())
    const patientName = [reportData.patient_first_name, reportData.patient_surname].filter(Boolean).join(' ').trim()
    const title = `${drawTextValue(reportData.modality)} - ${drawTextValue(reportData.study_name)}`
    const findings = drawTextValue(reportData.doctor_findings)
    const impression = drawTextValue(reportData.doctor_impression)
    const doctorName = [reportData.doctor_first_name, reportData.doctor_last_name].filter(Boolean).join(' ').trim()
    const doctorDisplayName = doctorName ? `Dr. ${doctorName}` : '—'
    const submittedDate = formatReportTimestamp(reportData.completed_at || reportData.submitted_at || reportData.created_at)
    const ageYears = Number(reportData.age_year)
    const ageMonths = Number(reportData.age_month)
    const hasValidYears = Number.isInteger(ageYears) && ageYears >= 0
    const hasValidMonths = Number.isInteger(ageMonths) && ageMonths >= 0
    let formattedAge = '—'
    if (hasValidYears && hasValidMonths) {
      if (ageYears > 0 && ageMonths > 0) formattedAge = `${ageYears} YRS / ${ageMonths} M`
      else if (ageYears > 0) formattedAge = `${ageYears} YRS`
      else formattedAge = `${ageMonths} M`
    }

    let cursorY = 26

    // Letterhead placeholder space
    pdf.setDrawColor(240, 240, 240)
    pdf.line(left, cursorY, pageWidth - right, cursorY)
    cursorY += 12

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text('Patient Details', left, cursorY)
    cursorY += 5

    const detailsStartY = cursorY
    const rowHeight = 8
    const tableRows = [
      ['Patient Name', drawTextValue(patientName), 'Case ID', drawTextValue(reportData.case_id)],
      ['Patient Age', drawTextValue(formattedAge), 'Date & Time', submittedDate],
      ['Patient Gender', drawTextValue(reportData.gender), 'Modality', drawTextValue(reportData.modality)],
    ]
    const tableWidth = contentWidth
    const halfWidth = tableWidth / 2
    const leftLabelWidth = 26
    const leftValueWidth = halfWidth - leftLabelWidth
    const rightLabelWidth = 24
    const rightValueWidth = halfWidth - rightLabelWidth
    const tableHeight = tableRows.length * rowHeight

    pdf.setDrawColor(180, 180, 180)
    pdf.setLineWidth(0.2)
    pdf.rect(left, detailsStartY, tableWidth, tableHeight)
    pdf.line(left + halfWidth, detailsStartY, left + halfWidth, detailsStartY + tableHeight)
    pdf.line(left + leftLabelWidth, detailsStartY, left + leftLabelWidth, detailsStartY + tableHeight)
    pdf.line(left + halfWidth + rightLabelWidth, detailsStartY, left + halfWidth + rightLabelWidth, detailsStartY + tableHeight)
    for (let rowIndex = 1; rowIndex < tableRows.length; rowIndex += 1) {
      const rowY = detailsStartY + rowIndex * rowHeight
      pdf.line(left, rowY, left + tableWidth, rowY)
    }

    pdf.setFontSize(9.7)
    tableRows.forEach((row, index) => {
      const rowY = detailsStartY + index * rowHeight + 5.3
      const [leftLabel, leftValue, rightLabel, rightValue] = row
      pdf.setFont('helvetica', 'bold')
      pdf.text(leftLabel, left + 1.8, rowY)
      pdf.setFont('helvetica', 'normal')
      pdf.text(pdf.splitTextToSize(leftValue, leftValueWidth - 3), left + leftLabelWidth + 1.8, rowY)
      pdf.setFont('helvetica', 'bold')
      pdf.text(rightLabel, left + halfWidth + 1.8, rowY)
      pdf.setFont('helvetica', 'normal')
      pdf.text(pdf.splitTextToSize(rightValue, rightValueWidth - 3), left + halfWidth + rightLabelWidth + 1.8, rowY)
    })

    const separatorY = detailsStartY + tableHeight + 4
    pdf.setDrawColor(210, 210, 210)
    pdf.line(left, separatorY, pageWidth - right, separatorY)
    cursorY = separatorY + 7

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    const titleWidth = pdf.getTextWidth(title)
    const titleX = (pageWidth - titleWidth) / 2
    pdf.text(title, titleX, cursorY)
    pdf.line(titleX, cursorY + 1.2, titleX + titleWidth, cursorY + 1.2)
    cursorY += 10

    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('FINDINGS', left, cursorY)
    cursorY += 5
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const findingsLines = pdf.splitTextToSize(findings, contentWidth)
    pdf.text(findingsLines, left, cursorY)
    cursorY += findingsLines.length * 4.8 + 6

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text('IMPRESSION', left, cursorY)
    cursorY += 5
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const impressionLines = pdf.splitTextToSize(impression, contentWidth)
    pdf.text(impressionLines, left, cursorY)

    const signatureBoxWidth = 66
    const signatureBoxX = pageWidth - right - signatureBoxWidth
    const signatureStartY = pageHeight - 78
    const hasSignatureImage = typeof reportData.doctor_signature_data === 'string' && reportData.doctor_signature_data.trim().length > 0
    if (hasSignatureImage) {
      try {
        const signatureData = reportData.doctor_signature_data.trim()
        const formatMatch = signatureData.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/)
        const imageFormat = formatMatch?.[1]?.toUpperCase() === 'JPEG' ? 'JPEG' : 'PNG'
        pdf.addImage(signatureData, imageFormat, signatureBoxX, signatureStartY, signatureBoxWidth, 18, undefined, 'FAST')
      } catch {
        // Keep the report generation resilient when signature image parsing fails.
      }
    }

    let signatureTextY = signatureStartY + 24
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(drawTextValue(doctorDisplayName), signatureBoxX, signatureTextY)
    signatureTextY += 4.8
    pdf.setFont('helvetica', 'normal')
    pdf.text(drawTextValue(reportData.doctor_specialization), signatureBoxX, signatureTextY)
    signatureTextY += 4.8
    pdf.text(`REG. NO.: ${drawTextValue(reportData.doctor_reg_no)}`, signatureBoxX, signatureTextY)

    const footerY = pageHeight - 26
    pdf.setDrawColor(225, 225, 225)
    pdf.line(left, footerY - 3, pageWidth - right, footerY - 3)
    pdf.setFontSize(8.7)
    const disclaimerLines = pdf.splitTextToSize(reportDisclaimer, contentWidth)
    pdf.text(disclaimerLines, left, footerY)

    const blob = pdf.output('blob')
    const fileName = `case-${reportData.case_id}-report.pdf`
    return { blob, fileName }
  }

  async function openReportPreview(caseItem) {
    console.info('[report-debug-ui] Download report clicked', {
      caseId: caseItem?.case_id,
      activeTab,
      role: normalizedRole,
      nexusId: user?.nexus_id || null,
      userId: user?.id || null,
    })
    setLocalNotice(`Preparing report preview for case #${caseItem?.case_id}...`)
    setError('')
    setReportPreviewCase(caseItem)
    setIsReportPreviewLoading(true)
    setReportPreviewError('')
    try {
      const result = await requestWithScope(`/cases/${encodeURIComponent(String(caseItem.case_id))}/report`, user)
      const report = result.report
      const generated = await buildCaseReportPdf(report)
      if (reportPreviewUrl) {
        URL.revokeObjectURL(reportPreviewUrl)
      }
      const blobUrl = URL.createObjectURL(generated.blob)
      setReportPreviewUrl(blobUrl)
      setReportPreviewName(generated.fileName)
      setLocalNotice(`Report preview ready for case #${caseItem?.case_id}.`)
    } catch (reportError) {
      setReportPreviewUrl('')
      setReportPreviewName('')
      setReportPreviewError(reportError instanceof Error ? reportError.message : 'Unable to prepare report preview right now.')
      setLocalNotice(`Report preview failed for case #${caseItem?.case_id}. Check the error shown in the preview modal.`)
    } finally {
      setIsReportPreviewLoading(false)
    }
  }

  const closeReportPreview = () => {
    if (reportPreviewUrl) {
      URL.revokeObjectURL(reportPreviewUrl)
    }
    setReportPreviewCase(null)
    setReportPreviewUrl('')
    setReportPreviewName('')
    setReportPreviewError('')
    setIsReportPreviewLoading(false)
  }

  useEffect(() => () => {
    if (reportPreviewUrl) {
      URL.revokeObjectURL(reportPreviewUrl)
    }
  }, [reportPreviewUrl])

  const openDoctorWorkModal = (caseItem) => {
    setDoctorWorkCase(caseItem)
    setDoctorFindingsInput(caseItem?.doctor_findings || '')
    setDoctorImpressionInput(caseItem?.doctor_impression || '')
    setDoctorWorkValidationError('')
    markInteracted(Number(caseItem.case_id))
  }

  const saveDoctorWork = async (submitCase) => {
    if (!doctorWorkCase) return
    const findings = doctorFindingsInput.trim()
    const impression = doctorImpressionInput.trim()
    if (submitCase && (!findings || !impression)) {
      setDoctorWorkValidationError('Doctor findings and doctor impression are both required for submit.')
      return
    }
    setIsDoctorWorkSubmitting(true)
    setError('')
    setDoctorWorkValidationError('')
    try {
      const result = await requestWithScope(`/cases/${encodeURIComponent(String(doctorWorkCase.case_id))}/doctor-report`, user, {
        method: 'PATCH',
        body: JSON.stringify({
          doctorFindings: doctorFindingsInput,
          doctorImpression: doctorImpressionInput,
          submit: String(submitCase),
        }),
      })
      setCases((previous) => previous.map((entry) => (entry.case_id === result.case.case_id ? { ...entry, ...result.case } : entry)))
      setLocalNotice(submitCase ? `Case #${result.case.case_id} submitted.` : `Case #${result.case.case_id} progress saved.`)
      if (submitCase) setDoctorWorkCase(null)
    } catch (workError) {
      setError(workError instanceof Error ? workError.message : 'Unable to save doctor work right now.')
    } finally {
      setIsDoctorWorkSubmitting(false)
    }
  }

  const selectedAttachment = attachments[selectedAttachmentIndex] || null
  const selectedAttachmentUrl = selectedAttachment?.signed_url || ''
  const selectedAttachmentType = String(selectedAttachment?.file_type || '').toLowerCase()
  const isPdfAttachment = selectedAttachmentType.includes('pdf') || selectedAttachmentUrl.toLowerCase().endsWith('.pdf')

  const getStatusClassName = (caseItem) => {
    const status = String(caseItem?.status || '')
    const caseId = Number(caseItem?.case_id)
    if (status === 'Reverted') return 'text-red-700'
    if (status === 'Reopened' && isDoctorView) return 'text-red-700'
    if (status === 'Submitted') return activeTab === 'history' ? 'text-slate-700' : 'text-slate-500'
    if (status === 'Unassigned' && isDoctorView && activeTab === 'active' && !interactedCaseIds.includes(caseId)) return 'font-semibold text-slate-900'
    return 'text-slate-700'
  }

  return (
    <section className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${activeTab === 'active' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`} onClick={() => setActiveTab('active')} type="button">Active Cases</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${activeTab === 'history' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`} onClick={() => setActiveTab('history')} type="button">Submitted / History</button>
        {!isDoctorView && (
          <button className="ml-auto rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => onAddCase?.()} type="button">
            + Add Case
          </button>
        )}
      </div>

      {effectiveNotice && <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{effectiveNotice}</p>}
      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <div className="relative min-w-56 flex-1">
          <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" onChange={(event) => setSearchText(event.target.value)} placeholder="Search by patient, case ID, or study" value={searchText} />
          {searchText && <button aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700" onClick={() => setSearchText('')} type="button">✕</button>}
        </div>
        <MultiSelectDropdown allLabel="All Modalities" label="Modality" onChange={setModalityFilters} options={modalityFilterOptions} selectedValues={modalityFilters} />
        {showStatusFilter && (
          <MultiSelectDropdown allLabel="All Statuses" label="Status" onChange={setStatusFilters} options={statusFilterOptions} selectedValues={statusFilters} />
        )}
        <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" onChange={(event) => setQuickSort(event.target.value)} value={sortConfig.key === 'patient_name' ? 'patient' : sortConfig.key === 'submit_date' ? 'newest' : 'priority'}>
          <option value="priority">Priority: Emergency first</option>
          <option value="newest">Newest Submit Date</option>
          <option value="patient">Patient Name</option>
        </select>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200">
        <table className={`min-w-full table-fixed text-sm ${isDoctorView ? 'min-w-[1220px]' : 'min-w-[1160px]'}`}>
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr className="text-xs uppercase tracking-wider text-slate-600">
              <th className="w-24 px-3 py-2 text-left font-semibold"><button className="inline-flex items-center gap-1" onClick={() => toggleSort('case_id')} type="button">Case ID <span>{sortIcon('case_id')}</span></button></th>
              <th className="w-40 px-3 py-2 text-left font-semibold"><button className="inline-flex items-center gap-1" onClick={() => toggleSort('patient_name')} type="button">Patient Name <span>{sortIcon('patient_name')}</span></button></th>
              <th className="w-20 px-3 py-2 text-left font-semibold"><button className="inline-flex items-center gap-1" onClick={() => toggleSort('gender')} type="button">Gender <span>{sortIcon('gender')}</span></button></th>
              <th className="w-32 px-3 py-2 text-left font-semibold"><button className="inline-flex items-center gap-1" onClick={() => toggleSort('contact')} type="button">{isDoctorView ? 'Centre Name' : 'Mobile Number'} <span>{sortIcon('contact')}</span></button></th>
              <th className="w-20 px-3 py-2 text-left font-semibold"><button className="inline-flex items-center gap-1" onClick={() => toggleSort('modality')} type="button">Modality <span>{sortIcon('modality')}</span></button></th>
              <th className="w-40 px-3 py-2 text-left font-semibold"><button className="inline-flex items-center gap-1" onClick={() => toggleSort('study_name')} type="button">Study Name <span>{sortIcon('study_name')}</span></button></th>
              <th className="w-56 px-3 py-2 text-left font-semibold">Remark</th>
              {showStatusColumn && <th className="w-28 px-3 py-2 text-left font-semibold"><button className="inline-flex items-center gap-1" onClick={() => toggleSort('status')} type="button">Status <span>{sortIcon('status')}</span></button></th>}
              <th className="w-44 px-3 py-2 text-left font-semibold"><button className="inline-flex items-center gap-1" onClick={() => toggleSort('submit_date')} type="button">Submit Date <span>{sortIcon('submit_date')}</span></button></th>
              <th className="w-52 px-3 py-2 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && filteredAndSortedCases.length === 0 && <tr><td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={totalColumns}>No cases found for the selected filters.</td></tr>}
            {isLoading && <tr><td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={totalColumns}>Loading cases...</td></tr>}
            {!isLoading && filteredAndSortedCases.map((caseItem, index) => {
              const emergencyRow = activeTab === 'active' && isEmergencyPriority(caseItem.priority)
              const zebraClass = index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
              const statusClass = getStatusClassName(caseItem)
              const status = String(caseItem.status || '')
              const isIgnored = ignoredCaseIds.includes(Number(caseItem.case_id))
              const centreCanEdit = isCentreUser ? ['Draft', 'Unassigned', 'Reverted'].includes(status) : true
              const showEditForCentre = !(isCentreUser && activeTab === 'history')
              const doctorCanTakeQueueActions = status === 'Unassigned'
              const doctorCanStartWork = ['Assigned', 'Reopened'].includes(status) && String(caseItem.assigned_doctor_id || '') === String(currentUserId || '')

              return (
                <tr key={caseItem.case_id} className={`${emergencyRow ? 'bg-amber-50' : zebraClass} border-t border-slate-200`}>
                  <td className={`px-3 py-2 font-medium ${statusClass}`}>{caseItem.case_id}</td>
                  <td className={`px-3 py-2 ${statusClass}`}>{formatPatientName(caseItem) || '—'}</td>
                  <td className={`px-3 py-2 ${statusClass}`}>{caseItem.gender || '—'}</td>
                  <td className={`px-3 py-2 ${statusClass}`}>{isDoctorView ? (caseItem.centre_name || '—') : (caseItem.mobile || '—')}</td>
                  <td className={`px-3 py-2 ${statusClass}`}>{caseItem.modality || '—'}</td>
                  <td className={`px-3 py-2 ${statusClass}`}>{caseItem.study_name || '—'}</td>
                  <td className={`px-3 py-2 ${statusClass}`}>{caseItem.remark || '—'}</td>
                  {showStatusColumn && <td className={`px-3 py-2 font-medium ${statusClass}`}>{status || '—'}</td>}
                  <td className={`px-3 py-2 ${statusClass}`}>{formatTimestamp(caseItem.completed_at || caseItem.submitted_at || caseItem.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!isDoctorView && showEditForCentre && (
                        <IconButton disabled={!centreCanEdit} label={centreCanEdit ? 'Edit case' : 'Edit disabled for this status'} onClick={() => centreCanEdit && onEditCase?.(caseItem)}>
                          <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M4 20h4l10-10a2.12 2.12 0 0 0-3-3L5 17v3z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </IconButton>
                      )}

                      {isDoctorView && activeTab === 'active' && doctorCanTakeQueueActions && (
                        <>
                          <IconButton className="text-emerald-700 hover:border-emerald-600 hover:text-emerald-800" label="Pick case" onClick={() => runDoctorAction(caseItem, 'accept')}>
                            <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </IconButton>
                          <IconButton className="text-red-700 hover:border-red-600 hover:text-red-800" label="Reject case with remark" onClick={() => { setRejectModalCase(caseItem); setRejectRemarkInput('') }}>
                            <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </IconButton>
                          <IconButton className={isIgnored ? 'text-emerald-700 hover:border-emerald-600 hover:text-emerald-800' : 'text-slate-400 hover:border-slate-400 hover:text-slate-500'} label={isIgnored ? 'Restore to active queue' : 'Ignore case from active queue'} onClick={() => runDoctorAction(caseItem, isIgnored ? 'restore' : 'ignore')}>
                            <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                              {isIgnored ? <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M5 12h14" strokeLinecap="round" strokeLinejoin="round" />}
                            </svg>
                          </IconButton>
                        </>
                      )}

                      {isDoctorView && activeTab === 'active' && doctorCanStartWork && (
                        <IconButton className="text-indigo-700 hover:border-indigo-600 hover:text-indigo-800" label="Start work" onClick={() => openDoctorWorkModal(caseItem)}>
                          <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </IconButton>
                      )}

                      {activeTab === 'history' && (
                        <IconButton className="text-indigo-700 hover:border-indigo-600 hover:text-indigo-800" label="Download report" onClick={() => openReportPreview(caseItem)}>
                          <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 3v12" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 21h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </IconButton>
                      )}

                      <IconButton label="View attachments" onClick={() => openAttachmentViewer(caseItem)}>
                        <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
                      </IconButton>

                      {isCentreUser && activeTab === 'history' && (
                        <IconButton className="text-amber-700 hover:border-amber-600 hover:text-amber-800" label="Reopen case" onClick={() => onReopenCase?.(caseItem)}>
                          <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </IconButton>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rejectModalCase && (
        <div className="absolute right-4 top-16 z-20 w-full max-w-md rounded-xl border border-slate-300 bg-white p-4 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">Reject case #{rejectModalCase?.case_id}</p>
          <p className="mt-1 text-xs text-slate-500">This remark will be appended to rejection history.</p>
          <textarea className="mt-3 h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" onChange={(event) => setRejectRemarkInput(event.target.value)} placeholder="Enter rejection remark" value={rejectRemarkInput} />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100" onClick={() => { setRejectModalCase(null); setRejectRemarkInput('') }} type="button">Cancel</button>
            <button className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60" disabled={isRejectSubmitting} onClick={submitRejectRemark} type="button">{isRejectSubmitting ? 'Saving...' : 'Reject'}</button>
          </div>
        </div>
      )}

      {attachmentModalCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-3 py-4">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Attachments</p>
                <h3 className="text-lg font-semibold text-slate-900">Case #{attachmentModalCase.case_id}</h3>
              </div>
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100" onClick={() => setAttachmentModalCase(null)} type="button">Close</button>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
              {isAttachmentLoading && <p className="text-sm text-slate-600">Loading attachments...</p>}
              {!isAttachmentLoading && attachments.length === 0 && <p className="text-sm text-slate-600">No attachments found for this case.</p>}
              {!isAttachmentLoading && selectedAttachment && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">File {selectedAttachmentIndex + 1} of {attachments.length}: {selectedAttachment.file_name || selectedAttachment.file_url}</p>
                  <div className="h-[560px] overflow-auto rounded-lg border border-slate-300 bg-white">
                    {isPdfAttachment
                      ? (selectedAttachmentUrl ? <iframe className="h-full w-full" src={selectedAttachmentUrl} title="PDF attachment viewer" /> : <p className="p-4 text-sm text-slate-600">Unable to preview PDF right now.</p>)
                      : (selectedAttachmentUrl ? <img alt={selectedAttachment.file_name || 'attachment'} className="mx-auto max-h-[545px] object-contain" src={selectedAttachmentUrl} /> : <p className="p-4 text-sm text-slate-600">Unable to preview image right now.</p>)}
                  </div>
                  <div className="flex items-center justify-between">
                    <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50" disabled={selectedAttachmentIndex <= 0} onClick={() => setSelectedAttachmentIndex((previous) => previous - 1)} type="button">Previous</button>
                    <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50" disabled={selectedAttachmentIndex >= attachments.length - 1} onClick={() => setSelectedAttachmentIndex((previous) => previous + 1)} type="button">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {reportPreviewCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-3 py-4">
          <div className="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Report Preview</p>
                <h3 className="text-lg font-semibold text-slate-900">Case #{reportPreviewCase.case_id}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!reportPreviewUrl || isReportPreviewLoading}
                  onClick={() => {
                    if (!reportPreviewUrl) return
                    const link = document.createElement('a')
                    link.href = reportPreviewUrl
                    link.download = reportPreviewName || `case-${reportPreviewCase.case_id}-report.pdf`
                    link.click()
                  }}
                  type="button"
                >
                  Download PDF
                </button>
                <button aria-label="Close preview" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100" onClick={closeReportPreview} type="button">Close</button>
              </div>
            </div>
            <div className="mt-3 h-[78vh] rounded-lg border border-slate-200 bg-slate-50 p-2">
              {isReportPreviewLoading && <p className="text-sm text-slate-600">Preparing report preview...</p>}
              {!isReportPreviewLoading && reportPreviewError && (
                <div className="m-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p>{reportPreviewError}</p>
                  <button
                    className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    onClick={() => openReportPreview(reportPreviewCase)}
                    type="button"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!isReportPreviewLoading && reportPreviewUrl && <iframe className="h-full w-full rounded-md bg-white" src={reportPreviewUrl} title="Generated report preview" />}
              {!isReportPreviewLoading && !reportPreviewUrl && !reportPreviewError && <p className="text-sm text-slate-600">Unable to render report preview right now.</p>}
            </div>
          </div>
        </div>
      )}

      {doctorWorkCase && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-3 py-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Doctor Workbench</p>
                <h3 className="text-lg font-semibold text-slate-900">Case #{doctorWorkCase.case_id}</h3>
              </div>
              <div className="flex items-center gap-2">
                <IconButton label="View attachments" onClick={() => openAttachmentViewer(doctorWorkCase)}>
                  <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
                </IconButton>
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100" onClick={() => setDoctorWorkCase(null)} type="button">Close</button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Patient</label><input className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value={formatPatientName(doctorWorkCase)} /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Age (Years - Months)</label><input className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value={`${doctorWorkCase.age_year ?? 0} - ${doctorWorkCase.age_month ?? 0}`} /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Gender</label><input className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value={doctorWorkCase.gender || ''} /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Modality</label><input className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value={doctorWorkCase.modality || ''} /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Study Name</label><input className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value={doctorWorkCase.study_name || ''} /></div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Case Remark</label>
                <textarea className="h-20 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value={doctorWorkCase.remark || '—'} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Diagnostic Centre</label>
                <input className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value={doctorWorkCase.centre_name || doctorWorkCase.centre_id || '—'} />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">Doctor Findings</label>
              <textarea className="h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" onChange={(event) => {
                setDoctorFindingsInput(event.target.value)
                if (doctorWorkValidationError) setDoctorWorkValidationError('')
              }} value={doctorFindingsInput} />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">Doctor Impression</label>
              <textarea className="h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" onChange={(event) => {
                setDoctorImpressionInput(event.target.value)
                if (doctorWorkValidationError) setDoctorWorkValidationError('')
              }} value={doctorImpressionInput} />
            </div>
            {doctorWorkValidationError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{doctorWorkValidationError}</p>}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" onClick={() => saveDoctorWork(false)} type="button">Save</button>
              <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isDoctorWorkSubmitting || !doctorFindingsInput.trim() || !doctorImpressionInput.trim()} onClick={() => saveDoctorWork(true)} type="button">{isDoctorWorkSubmitting ? 'Working...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default CaseManagementTable
