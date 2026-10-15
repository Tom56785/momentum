import { useEffect, useState } from 'react'

export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  // iPhone Safari has no element fullscreen for web pages.
  const supported = typeof document !== 'undefined' && !!document.fullscreenEnabled
  const [active, setActive] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = () => {
    if (!supported) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => undefined)
  }
  return { supported, active, toggle }
}
