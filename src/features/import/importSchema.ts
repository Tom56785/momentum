import { z } from 'zod'
import { PHASES } from '../../db/types'
import schemaText from '../../../schema/momentum-import-v1.schema.json?raw'

/** Zod mirror of schema/momentum-import-v1.schema.json. Keep the two in sync (a test checks this). */
export const importSubtaskSchema = z.strictObject({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  phase: z.enum(PHASES).optional(),
  timeboxMinutes: z.number().int().min(1).max(480).optional(),
  // Tag names; ones that don't exist yet are created on import. Duplicates are merged.
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
})

export const importProjectSchema = z.strictObject({
  title: z.string().min(1).max(200),
  externalKey: z.string().optional(),
  url: z.url().optional(),
  summary: z.string().optional(),
  problem: z.string().optional(),
  cause: z.string().optional(),
  solution: z.string().optional(),
  targetDate: z.iso.date().optional(),
  subtasks: z.array(importSubtaskSchema).min(1),
})

export const importDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projects: z.array(importProjectSchema).min(1),
})

export type ImportDocument = z.infer<typeof importDocumentSchema>
export type ImportProject = z.infer<typeof importProjectSchema>

export const IMPORT_JSON_SCHEMA_TEXT: string = schemaText

export const AI_PROMPT_TEMPLATE = `Summarise the ticket below into JSON that matches this schema exactly. Output only the JSON.

Rules:
- schemaVersion is 1.
- Fill summary, problem, cause and solution in plain language, 1-3 sentences each.
- Break the work into 5-12 subtasks in the order they should be done.
- Each subtask title starts with a verb and is small enough to start in under 2 minutes.
- The first subtask is always a tiny, easy step (e.g. "Read the ticket and summary").
- Cover: understanding, investigation, implementation, testing, PR/review and deployment.
- Suggest a realistic timeboxMinutes for each subtask.
- Give subtasks tags where they help: short lowercase labels such as backend, frontend or docs. Existing tags: {{TAGS}}. Reuse these where they fit.
- Leave out any field you are unsure of rather than guessing.

Schema:
{{SCHEMA}}

Ticket:
{{PASTE TICKET HERE}}`

export const SCHEMA_PLACEHOLDER = '{{SCHEMA}}'
export const TAGS_PLACEHOLDER = '{{TAGS}}'

/**
 * The prompt to copy: the user's template (or the default) with the import schema and the
 * names of existing tags filled in.
 */
export function buildAiPrompt(template: string = AI_PROMPT_TEMPLATE, tagNames: readonly string[] = []): string {
  return template
    .split(SCHEMA_PLACEHOLDER)
    .join(IMPORT_JSON_SCHEMA_TEXT.trim())
    .split(TAGS_PLACEHOLDER)
    .join(tagNames.length ? tagNames.join(', ') : 'none yet')
}
