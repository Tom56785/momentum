import { useSyncExternalStore } from 'react'

// One shared ticker for the whole app. It only triggers re-renders; nothing is ever summed per tick.
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function tick() {
  now = Date.now()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    timer = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }
}

const getSnapshot = () => now

/** Current time, updated once per second and immediately when the tab becomes visible. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}
