import { useState } from 'react'

const PRESETS = [5, 15, 25, 45]

/** Select with timebox presets (5, 15, 25, 45) plus a custom number of minutes. */
export function TimeboxPicker({
  value,
  onChange,
  label = 'Timebox',
}: {
  value: number | undefined
  onChange: (minutes: number | undefined) => void
  label?: string
}) {
  const [custom, setCustom] = useState(false)
  const [customValue, setCustomValue] = useState(String(value ?? ''))

  if (custom) {
    const commit = () => {
      const n = Math.round(Number(customValue))
      if (Number.isFinite(n) && n >= 1 && n <= 480) onChange(n)
      setCustom(false)
    }
    return (
      <input
        className="input"
        style={{ width: 90 }}
        type="number"
        min={1}
        max={480}
        autoFocus
        aria-label={`${label} in minutes`}
        placeholder="min"
        value={customValue}
        data-hints="Enter:Set|Esc:Cancel"
        onChange={(e) => setCustomValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setCustom(false)
          }
        }}
      />
    )
  }

  const options = value && !PRESETS.includes(value) ? [...PRESETS, value].sort((a, b) => a - b) : PRESETS
  return (
    <select
      className="select"
      aria-label={label}
      value={value ?? ''}
      data-hints=""
      onChange={(e) => {
        if (e.target.value === 'custom') {
          setCustomValue(String(value ?? ''))
          setCustom(true)
        } else onChange(e.target.value ? Number(e.target.value) : undefined)
      }}
    >
      <option value="">No timebox</option>
      {options.map((m) => (
        <option key={m} value={m}>
          {m} min
        </option>
      ))}
      <option value="custom">Custom…</option>
    </select>
  )
}
