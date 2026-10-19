import { useId, useLayoutEffect, useRef } from 'react'
import { useAutosave, type AutosaveFn } from '../hooks/useDebounced'

interface AutoFieldProps {
  label: string
  value: string | undefined
  /** Return false to reject a value; the field then reverts to the stored one. */
  onSave: AutosaveFn
  multiline?: boolean
  /** A single line of text that wraps onto more lines when it doesn't fit. */
  wrap?: boolean
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
  wrap,
  placeholder,
  type = 'text',
  className,
  hideLabel,
  hints,
}: AutoFieldProps) {
  const id = useId()
  const [draft, setDraft, flush] = useAutosave(value ?? '', onSave)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow textareas to fit their content, again when a new width rewraps it.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
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
      ) : wrap ? (
        <textarea
          id={id}
          ref={areaRef}
          className="input wrapInput"
          rows={1}
          value={draft}
          placeholder={placeholder}
          data-hints={hints ?? 'Enter:Save|Esc:Done'}
          // Still one line of text: pasted line breaks become spaces.
          onChange={(e) => setDraft(e.target.value.replace(/\s*\n\s*/g, ' '))}
          onBlur={flush}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            e.currentTarget.blur()
          }}
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
