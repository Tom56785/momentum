// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShortcuts } from './useShortcuts'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function setup(html: string, options?: { spaceOverridesButtons?: boolean }) {
  document.body.innerHTML = html
  const space = vi.fn()
  const b = vi.fn()
  renderHook(() => useShortcuts({ Space: space, b }, true, options))
  return { space, b }
}

describe('useShortcuts', () => {
  it('ignores keys while typing in a field', () => {
    const { b } = setup('<input id="t" />')
    fireEvent.keyDown(document.getElementById('t')!, { key: 'b' })
    expect(b).not.toHaveBeenCalled()
  })

  it('Escape in a field leaves the field', () => {
    setup('<input id="t" />')
    const field = document.getElementById('t')!
    field.focus()
    const allowed = fireEvent.keyDown(field, { key: 'Escape' })
    expect(document.activeElement).not.toBe(field)
    expect(allowed).toBe(false)
  })

  it('leaves Escape in a dialog field to the dialog, so one press closes it', () => {
    setup('<dialog open><textarea id="t"></textarea></dialog>')
    const field = document.getElementById('t')!
    field.focus()
    const allowed = fireEvent.keyDown(field, { key: 'Escape' })
    expect(document.activeElement).toBe(field)
    // Not prevented, so the browser's own Escape (closing the dialog) still happens.
    expect(allowed).toBe(true)
  })

  it('leaves Space to a focused button by default', () => {
    const { space } = setup('<button id="x">x</button>')
    fireEvent.keyDown(document.getElementById('x')!, { key: ' ' })
    expect(space).not.toHaveBeenCalled()
  })

  it('can make Space always mean start/stop, even on a button', () => {
    const { space } = setup('<button id="x">x</button>', { spaceOverridesButtons: true })
    fireEvent.keyDown(document.getElementById('x')!, { key: ' ' })
    expect(space).toHaveBeenCalledOnce()
  })

  it('still lets Space pick items inside menus and banners', () => {
    const { space } = setup('<div role="menu" data-own-keys><button id="m">10 minutes</button></div>', {
      spaceOverridesButtons: true,
    })
    fireEvent.keyDown(document.getElementById('m')!, { key: ' ' })
    expect(space).not.toHaveBeenCalled()
  })
})
