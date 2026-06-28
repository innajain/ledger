import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { createElement as h } from 'react'
import { Picker } from './Picker'

const tick = (ms = 25) => new Promise(r => setTimeout(r, ms))
const ESC = String.fromCharCode(27)
const KEY = { down: ESC + '[B', up: ESC + '[A', enter: '\r', esc: ESC }
const items = [
  { id: 'a1', name: 'Bank' },
  { id: 'a2', name: 'Cash' },
  { id: 'a3', name: 'Credit Card' },
]

describe('Picker', () => {
  it('selects the first item on enter', async () => {
    const onSelect = vi.fn()
    const { stdin, unmount } = render(h(Picker, { label: 'Head', items, onSelect, onCancel: vi.fn() }))
    await tick()
    stdin.write(KEY.enter)
    await tick()
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }))
    unmount()
  })

  it('filters by typed text then selects the match', async () => {
    const onSelect = vi.fn()
    const { stdin, unmount } = render(h(Picker, { label: 'Head', items, onSelect, onCancel: vi.fn() }))
    await tick()
    stdin.write('cred')
    await tick()
    stdin.write(KEY.enter)
    await tick()
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a3' }))
    unmount()
  })

  it('moves the cursor with arrow keys', async () => {
    const onSelect = vi.fn()
    const { stdin, unmount } = render(h(Picker, { label: 'Head', items, onSelect, onCancel: vi.fn() }))
    await tick()
    stdin.write(KEY.down)
    await tick()
    stdin.write(KEY.enter)
    await tick()
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a2' }))
    unmount()
  })

  it('cancels on escape', async () => {
    const onCancel = vi.fn()
    const { stdin, unmount } = render(h(Picker, { label: 'Head', items, onSelect: vi.fn(), onCancel }))
    await tick()
    stdin.write(KEY.esc)
    await tick()
    expect(onCancel).toHaveBeenCalled()
    unmount()
  })

  it('invokes the extra (finish) option instead of onSelect', async () => {
    const onPick = vi.fn()
    const onSelect = vi.fn()
    const { stdin, unmount } = render(h(Picker, { label: 'Head', items, onSelect, onCancel: vi.fn(), extra: { label: 'finish', onPick } }))
    await tick()
    stdin.write(KEY.enter) // cursor 0 === extra row
    await tick()
    expect(onPick).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    unmount()
  })
})
