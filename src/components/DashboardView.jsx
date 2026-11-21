import { useCallback, useEffect, useMemo, useState } from 'react'
import { requestWithScope } from './managementApi.js'
import MultiSelectDropdown from './MultiSelectDropdown.jsx'
import { useRealtimeSync } from './useRealtimeSync.js'

const adminRoles = ['group_admin', 'nexus_admin', 'admin']
const diagnosticCentreRoles = ['centre_user', 'centre_manager']
const modalityLabels = { XRAY: 'X-RAY', CT: 'CT', MRI: 'MRI', ECG: 'ECG' }
const modalityColors = ['#0f766e', '#0ea5e9', '#a855f7', '#f97316', '#14b8a6', '#f43f5e']

const toDateInputValue = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getMonthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1)
const getYearStart = (date) => new Date(date.getFullYear(), 0, 1)
const getWeekStart = (date) => {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const next = new Date(date)
  next.setDate(date.getDate() + diff)
  return new Date(next.getFullYear(), next.getMonth(), next.getDate())
}

const parseDateValue = (value) => {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const parseTimestamp = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '—'
  const minutes = Math.floor(milliseconds / 60000)
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

const formatRupees = (value) => {
  if (!Number.isFinite(value)) return '₹0'
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

const getBillingSummary = (rows, rateKey) => {
  let amount = 0
  let hasError = false
  rows.forEach((caseItem) => {
    if (String(caseItem?.status || '') !== 'Submitted') return
    const rawRate = caseItem?.[rateKey]
    const numericRate = Number(rawRate)
    if (!Number.isFinite(numericRate)) {
      hasError = true
      return
    }
    const priority = String(caseItem?.priority || '').trim().toLowerCase()
    const multiplier = priority === 'emergency' || priority === 'urgent' ? 1.25 : 1
    amount += numericRate * multiplier
  })
  return { amount, hasError }
}

const buildDateRange = (start, end) => {
  if (!(start instanceof Date) || !(end instanceof Date) || start > end) return []
  const output = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endCopy = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (cursor <= endCopy) {
    output.push(toDateInputValue(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return output
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </article>
  )
}

function DonutChart({ segments }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (total === 0) {
    return (
      <div className="grid h-52 place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
        No modality data for this range.
      </div>
    )
  }

  const { stops } = segments.reduce((accumulator, segment, index) => {
    const start = accumulator.runningPercent
    const end = start + ((segment.value / total) * 100)
    const color = modalityColors[index % modalityColors.length]
    accumulator.stops.push(`${color} ${start}% ${end}%`)
    accumulator.runningPercent = end
    return accumulator
  }, { runningPercent: 0, stops: [] })

  return (
    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
      <div className="relative mx-auto size-52 rounded-full" style={{ background: `conic-gradient(${stops.join(', ')})` }}>
        <div className="absolute inset-8 grid place-items-center rounded-full bg-white text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
          <p className="text-2xl font-semibold text-slate-900">{total}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {segments.map((segment, index) => {
          const percent = total > 0 ? ((segment.value / total) * 100).toFixed(1) : '0.0'
          return (
            <li className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm" key={segment.label}>
              <span className="flex items-center gap-2 text-slate-700">
                <span className="size-3 rounded-full" style={{ backgroundColor: modalityColors[index % modalityColors.length] }} />
                {segment.label}
              </span>
              <span className="font-medium text-slate-900">{segment.value} ({percent}%)</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LineChart({ points }) {
  if (points.length === 0) {
    return (
      <div className="grid h-56 place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
        No data points available.
      </div>
    )
  }

  const width = 780
  const height = 240
  const padding = 24
  const maxValue = Math.max(...points.map((point) => point.value), 1)
  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0
  const coords = points.map((point, index) => {
    const x = padding + (xStep * index)
    const y = height - padding - ((height - (padding * 2)) * point.value) / maxValue
    return { ...point, x, y }
  })
  const polylinePoints = coords.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <svg className="h-64 w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <line stroke="#e2e8f0" strokeWidth="1" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        <line stroke="#e2e8f0" strokeWidth="1" x1={padding} x2={padding} y1={padding} y2={height - padding} />
        <polyline fill="none" points={polylinePoints} stroke="#0f766e" strokeWidth="3" />
        {coords.map((point) => (
          <circle cx={point.x} cy={point.y} fill="#0f766e" key={point.date} r="3" />
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{points[0]?.date || ''}</span>
        <span>{points[points.length - 1]?.date || ''}</span>
      </div>
    </div>
  )
}

function DashboardView({ user }) {
  const [cases, setCases] = useState([])
  const [centres, setCentres] = useState([])
  const [doctors, setDoctors] = useState([])
  const [selectedCentreIds, setSelectedCentreIds] = useState([])
  const [selectedDoctorIds, setSelectedDoctorIds] = useState([])
  const [quickSlot, setQuickSlot] = useState('This Month')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const [today] = useState(() => new Date())
  const [startDate, setStartDate] = useState(() => toDateInputValue(getMonthStart(new Date())))
  const [uptoDate, setUptoDate] = useState(() => toDateInputValue(new Date()))

  const normalizedRole = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : ''
  const isAdmin = adminRoles.includes(normalizedRole)
  const isDoctor = normalizedRole === 'doctor'
  const isCentreUser = diagnosticCentreRoles.includes(normalizedRole)

  const isCaseVisibleForUser = useCallback((caseItem) => {
    if (!caseItem || String(caseItem.status || '') === 'Archived') return false
    if (isDoctor) {
      const status = String(caseItem?.status || '')
      if (status === 'Unassigned') return true
      if (['Assigned', 'Submitted', 'Reopened'].includes(status)) {
        return String(caseItem?.assigned_doctor_id || '') === String(user?.id || '')
      }
      return false
    }
    if (isCentreUser) return String(caseItem?.centre_id || '') === String(user?.centre_id || '')
    return true
  }, [isCentreUser, isDoctor, user?.centre_id, user?.id])

  const loadDashboardData = useCallback(() => {
    let isActive = true
    const query = new URLSearchParams()
    if (isAdmin && selectedCentreIds.length > 0) query.set('centreIds', selectedCentreIds.join(','))
    if (isAdmin && selectedDoctorIds.length > 0) query.set('doctorIds', selectedDoctorIds.join(','))
    const casePath = query.toString() ? `/cases?${query.toString()}` : '/cases'

    const requests = [requestWithScope(casePath, user)]
    if (isAdmin) {
      requests.push(requestWithScope('/centres', user), requestWithScope('/doctors', user))
    }

    Promise.all(requests)
      .then((results) => {
        if (!isActive) return
        const [casesResult, centresResult, doctorsResult] = results
        setError('')
        setCases(Array.isArray(casesResult?.cases) ? casesResult.cases : [])
        setCentres(Array.isArray(centresResult?.centres) ? centresResult.centres : [])
        setDoctors(Array.isArray(doctorsResult?.doctors) ? doctorsResult.doctors : [])
      })
      .catch((requestError) => {
        if (!isActive) return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard analytics right now.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [isAdmin, selectedCentreIds, selectedDoctorIds, user])

  useEffect(() => loadDashboardData(), [loadDashboardData])
  const handleRealtimeDashboardChange = useCallback((payload) => {
    if (payload?.table !== 'cases') {
      loadDashboardData()
      return
    }
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
      if (hasExisting) return previous.map((entry) => (Number(entry.case_id) === caseId ? { ...entry, ...nextCase } : entry))
      return [{ ...nextCase }, ...previous]
    })
    loadDashboardData()
  }, [isCaseVisibleForUser, loadDashboardData])
  useRealtimeSync({ user, tables: ['cases', 'diagnostic_centres', 'doctors'], onChange: handleRealtimeDashboardChange })

  const applyQuickSlot = (value) => {
    const referenceDate = today
    let nextStart = getMonthStart(referenceDate)
    if (value === 'Today') nextStart = referenceDate
    if (value === 'This Week') nextStart = getWeekStart(referenceDate)
    if (value === 'This Year') nextStart = getYearStart(referenceDate)
    setQuickSlot(value)
    setStartDate(toDateInputValue(nextStart))
    setUptoDate(toDateInputValue(referenceDate))
  }

  const filteredCases = useMemo(() => {
    const start = parseDateValue(startDate)
    const end = parseDateValue(uptoDate)
    if (!start || !end || start > end) return []
    const endOfDay = new Date(end)
    endOfDay.setHours(23, 59, 59, 999)

    return cases.filter((caseItem) => {
      const createdAt = parseTimestamp(caseItem?.created_at)
      if (!createdAt || createdAt < start || createdAt > endOfDay) return false

      if (isDoctor && String(caseItem?.assigned_doctor_id || '') !== String(user?.id || '')) return false
      if (isCentreUser && String(caseItem?.centre_id || '') !== String(user?.centre_id || '')) return false

      if (isAdmin && selectedCentreIds.length > 0 && !selectedCentreIds.includes(String(caseItem?.centre_id || ''))) return false
      if (isAdmin && selectedDoctorIds.length > 0 && !selectedDoctorIds.includes(String(caseItem?.assigned_doctor_id || ''))) return false
      return true
    })
  }, [cases, isAdmin, isCentreUser, isDoctor, selectedCentreIds, selectedDoctorIds, startDate, uptoDate, user?.centre_id, user?.id])

  const metrics = useMemo(() => {
    let reportedCases = 0
    let reportedNormal = 0
    let reportedEmergency = 0
    let unassignedCases = 0
    let pendingCases = 0
    let totalCases = 0
    let actionRequiredCases = 0
    let tatTotalMs = 0
    let tatCount = 0

    filteredCases.forEach((caseItem) => {
      const status = String(caseItem?.status || '')
      if (status !== 'Draft') totalCases += 1
      if (status === 'Submitted') {
        reportedCases += 1
        if (String(caseItem?.priority || '').toLowerCase() === 'normal') reportedNormal += 1
        if (['emergency', 'urgent'].includes(String(caseItem?.priority || '').toLowerCase())) reportedEmergency += 1

        const createdAt = parseTimestamp(caseItem?.created_at)
        const submittedAt = parseTimestamp(caseItem?.completed_at || caseItem?.submitted_at)
        if (createdAt && submittedAt && submittedAt >= createdAt) {
          tatTotalMs += (submittedAt.getTime() - createdAt.getTime())
          tatCount += 1
        }
      }
      if (status === 'Unassigned') unassignedCases += 1
      if (status === 'Assigned' || status === 'Reopened') pendingCases += 1
      if (status === 'Reverted' || status === 'Reopened') actionRequiredCases += 1
    })

    return {
      reportedCases,
      reportedNormal,
      reportedEmergency,
      unassignedCases,
      pendingCases,
      totalCases,
      actionRequiredCases,
      averageTatMs: tatCount > 0 ? tatTotalMs / tatCount : 0,
      tatCount,
    }
  }, [filteredCases])

  const centrePay = useMemo(() => getBillingSummary(filteredCases, 'centre_rate'), [filteredCases])
  const doctorPayout = useMemo(() => getBillingSummary(filteredCases, 'doctor_rate'), [filteredCases])

  const modalitySegments = useMemo(() => {
    const counter = new Map()
    filteredCases.forEach((caseItem) => {
      const modality = String(caseItem?.modality || '').toUpperCase()
      if (!modality) return
      const label = modalityLabels[modality] || modality
      counter.set(label, (counter.get(label) || 0) + 1)
    })
    return Array.from(counter.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)
  }, [filteredCases])

  const trendPoints = useMemo(() => {
    const start = parseDateValue(startDate)
    const end = parseDateValue(uptoDate)
    const dateKeys = buildDateRange(start, end)
    const counts = new Map(dateKeys.map((key) => [key, 0]))
    filteredCases.forEach((caseItem) => {
      const createdAt = parseTimestamp(caseItem?.created_at)
      if (!createdAt) return
      const key = toDateInputValue(createdAt)
      if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1)
    })
    return dateKeys.map((key) => ({ date: key, value: counts.get(key) || 0 }))
  }, [filteredCases, startDate, uptoDate])

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="dashboard-start-date">Start Date</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" id="dashboard-start-date" max={uptoDate} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="dashboard-upto-date">Upto Date</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" id="dashboard-upto-date" min={startDate} onChange={(event) => setUptoDate(event.target.value)} type="date" value={uptoDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="dashboard-quick-slot">Quick Slots</label>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" id="dashboard-quick-slot" onChange={(event) => applyQuickSlot(event.target.value)} value={quickSlot}>
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
              <option value="This Year">This Year</option>
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnostic Centre</label>
              <MultiSelectDropdown
                allLabel="All Centres"
                label="Centres"
                onChange={setSelectedCentreIds}
                options={centres.map((centre) => centre.centre_id)}
                selectedValues={selectedCentreIds}
              />
            </div>
          )}
          {isAdmin && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Doctor</label>
              <MultiSelectDropdown
                allLabel="All Doctors"
                label="Doctors"
                onChange={setSelectedDoctorIds}
                options={doctors.map((doctor) => doctor.doctor_id)}
                selectedValues={selectedDoctorIds}
              />
            </div>
          )}
        </div>
        {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard hint={`Normal: ${metrics.reportedNormal} | Emergency: ${metrics.reportedEmergency}`} label="Reported Cases" value={metrics.reportedCases} />
        <MetricCard label="Unassigned Cases" value={metrics.unassignedCases} />
        <MetricCard label="Pending Cases" value={metrics.pendingCases} />
        <MetricCard label="Total Cases" value={metrics.totalCases} />
        <MetricCard label="Action Required" value={metrics.actionRequiredCases} />
      </section>

      {(isAdmin || isCentreUser || isDoctor) && (
        <section className={`grid gap-3 ${isAdmin ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
          {(isAdmin || isCentreUser) && (
            <MetricCard
              hint="For selected date range and filters"
              label="Diagnostic Centre Pay"
              value={centrePay.hasError ? '⚠ ₹0' : formatRupees(centrePay.amount)}
            />
          )}
          {(isAdmin || isDoctor) && (
            <MetricCard
              hint="For selected date range and filters"
              label="Doctor Payout"
              value={doctorPayout.hasError ? '⚠ ₹0' : formatRupees(doctorPayout.amount)}
            />
          )}
        </section>
      )}

      {isAdmin && (
        <section>
          <MetricCard hint={metrics.tatCount > 0 ? `Based on ${metrics.tatCount} submitted case(s)` : 'No submitted cases in selected range'} label="Average Turnaround Time (TAT)" value={formatDuration(metrics.averageTatMs)} />
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Modality Distribution Breakdown</h3>
          <p className="mb-4 text-xs text-slate-500">Selected range workload split by modality.</p>
          {isLoading ? <p className="text-sm text-slate-500">Loading modality analytics...</p> : <DonutChart segments={modalitySegments} />}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Volume Trend</h3>
          <p className="mb-4 text-xs text-slate-500">Day-wise case count for the active range.</p>
          {isLoading ? <p className="text-sm text-slate-500">Loading trend analytics...</p> : <LineChart points={trendPoints} />}
        </article>
      </section>
    </div>
  )
}

export default DashboardView
