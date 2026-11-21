import { useEffect, useMemo, useRef, useState } from 'react'

function MultiSelectDropdown({
  label,
  options = [],
  selectedValues = [],
  onChange,
  allLabel = 'All',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const safeSelected = Array.isArray(selectedValues) ? selectedValues : []
  const selectedSet = useMemo(() => new Set(safeSelected), [safeSelected])
  const selectedCount = safeSelected.length
  const triggerLabel = selectedCount === 0 ? allLabel : `${label}: ${selectedCount}`

  const toggleValue = (value) => {
    const next = new Set(selectedSet)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange?.(Array.from(next))
  }

  useEffect(() => {
    if (!isOpen) return undefined
    const handleOutsideClick = (event) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        className="min-w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
        onClick={() => setIsOpen((previous) => !previous)}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          {triggerLabel}
          <span className="text-xs text-slate-500">{isOpen ? '▲' : '▼'}</span>
        </span>
      </button>
      {isOpen && (
        <div className="absolute z-30 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <button
            className="mb-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => onChange?.([])}
            type="button"
          >
            {allLabel}
          </button>
          <div className="max-h-56 space-y-1 overflow-auto">
            {options.map((option) => (
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50" key={option}>
                <input
                  checked={selectedSet.has(option)}
                  onChange={() => toggleValue(option)}
                  type="checkbox"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default MultiSelectDropdown
