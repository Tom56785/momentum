import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  text: string
  tone?: 'neutral' | 'success' | 'celebrate'
  action?: { label: string; run: () => void }
  /** Milliseconds before auto-dismiss; 0 keeps it until dismissed. */
  duration?: number
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function showToast(toast: Omit<Toast, 'id'>): number {
  const id = nextId++
  toasts = [...toasts.filter((t) => t.text !== toast.text), { id, ...toast }]
  emit()
  const duration = toast.duration ?? 2600
  if (duration > 0) setTimeout(() => dismissToast(id), duration)
  return id
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts)
}
