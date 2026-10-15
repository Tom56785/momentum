import { useId, useLayoutEffect, useRef } from 'react'
import { useAutosave } from '../hooks/useDebounced'

interface AutoFieldProps {
  label: string
  value: string | undefined
  onSave: (value: string) => void | Promise<void>
  multiline?: boolean
  placeholder?: string
  type?: 'text' | 'url' | 'date'
  className?: string
  hideLabel?: boolean
  hints?: string
}

/** Inline-editable field that autosaves ~500ms after typing stops and on blur. */
export function AutoField({
  label,
  value,
  onSave,
  multiline,
  placeholder,
  type = 'text',
  className,
  hideLabel,
  hints,
}: AutoFieldProps) {
  const id = useId()
  const [draft, setDraft, flush] = useAutosave(value ?? '', onSave)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow textareas to fit their content.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [draft])

  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'label'}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          ref={areaRef}
          className="textarea"
          rows={2}
          value={draft}
          placeholder={placeholder}
          data-hints={hints ?? 'Esc:Done'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={flush}
        />
      ) : (
        <input
          id={id}
          className="input"
          type={type}
          value={draft}
          placeholder={placeholder}
          data-hints={hints ?? 'Enter:Save|Esc:Done'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={flush}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      )}
    </div>
  )
}
