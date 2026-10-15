import type { z } from 'zod'
import { importDocumentSchema, type ImportDocument } from './importSchema'

export type ParseResult =
  | { ok: true; doc: ImportDocument }
  | { ok: false; errors: string[] }
  | { ok: 'empty' }

/** Removes a wrapping ```json code fence (and any chatter around it) if present. */
export function stripCodeFence(text: string): string {
  const match = /```[a-zA-Z]*\s*\n?([\s\S]*?)```/.exec(text)
  return (match ? match[1] : text).trim()
}

export function formatPath(path: readonly PropertyKey[]): string {
  let out = ''
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`
    else out += out ? `.${String(part)}` : String(part)
  }
  return out || 'The document'
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const where = formatPath(issue.path)
  switch (issue.code) {
    case 'invalid_type':
      if (issue.expected === 'int') return `${where} should be a whole number`
      // Zod does not include the input by default; the message names what was received.
      if (issue.message.endsWith('received undefined')) return `${where} is missing`
      return `${where} should be ${issue.expected === 'array' || issue.expected === 'object' ? 'an' : 'a'} ${issue.expected}`
    case 'too_small':
      if (issue.origin === 'string') return `${where} is empty`
      if (issue.origin === 'array') return `${where} needs at least ${String(issue.minimum)} item`
      return `${where} should be at least ${String(issue.minimum)}`
    case 'too_big':
      if (issue.origin === 'string') return `${where} is too long (max ${String(issue.maximum)} characters)`
      return `${where} should be at most ${String(issue.maximum)}`
    case 'unrecognized_keys':
      return `${where} has an unknown field: ${issue.keys.map((k) => `"${k}"`).join(', ')}`
    case 'invalid_value':
      if (issue.path.at(-1) === 'schemaVersion') return 'schemaVersion should be 1'
      return `${where} should be one of: ${issue.values.map((v) => String(v)).join(', ')}`
    case 'invalid_format':
      if (issue.format === 'url') return `${where} should be a full link, like https://example.com/ABC-123`
      if (issue.format === 'date') return `${where} should be a date like 2026-10-22`
      return `${where} has the wrong format (${issue.format})`
    default:
      return `${where}: ${issue.message}`
  }
}

/** Parses and validates import text. Errors are friendly, with paths; never stack traces. */
export function parseImport(text: string): ParseResult {
  const cleaned = stripCodeFence(text)
  if (!cleaned) return { ok: 'empty' }
  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch (err) {
    const detail = err instanceof Error ? err.message.replace(/^JSON\.parse: /, '') : ''
    return { ok: false, errors: [`This isn't valid JSON yet${detail ? ` (${detail})` : ''}.`] }
  }
  const result = importDocumentSchema.safeParse(json)
  if (result.success) return { ok: true, doc: result.data }
  const errors = [...new Set(result.error.issues.map(describeIssue))]
  return { ok: false, errors }
}

export function totalTimeboxMinutes(project: { subtasks: { timeboxMinutes?: number }[] }): number {
  return project.subtasks.reduce((sum, s) => sum + (s.timeboxMinutes ?? 0), 0)
}
