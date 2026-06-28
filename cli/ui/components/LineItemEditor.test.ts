import { describe, it, expect, vi } from 'vitest'

// Mock the only DB-touching dependency so the editor renders with fake data
// (no prisma / no env). Everything else is pure.
vi.mock('../../shared', () => ({
  load_heads: vi.fn(async () => [{ id: 'h1', name: 'Cash', type: 'account', is_active: true, linked_user_id: null, parent_id: null }]),
  load_assets: vi.fn(async () => [{ id: 'as1', name: 'Money', type: 'rupees', ticker: null, is_active: true }]),
}))

import { render } from 'ink-testing-library'
import { createElement as h } from 'react'
import { LineItemEditor } from './LineItemEditor'

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms))
const ESC = String.fromCharCode(27)
const UP = ESC + '[A'
const DOWN = ESC + '[B'
const ENTER = '\r'
// ink-testing-library drops the first key after the async-load render swap; a
// no-op Up arrow at the top of the list absorbs it so the real flow is reliable.
const PRIME = UP

describe('LineItemEditor', () => {
  it('builds a line through the keyboard flow and returns it (lines mode)', async () => {
    const onDone = vi.fn()
    const { stdin, unmount } = render(h(LineItemEditor, { uid: 'u1', mode: 'lines', onDone, onCancel: vi.fn() }))
    await tick(80) // wait for load_heads/load_assets

    stdin.write(PRIME)
    await tick()
    stdin.write(DOWN) // head picker: row 0 is "finish", move to the head
    await tick()
    stdin.write(ENTER) // select Cash → asset phase
    await tick()
    stdin.write(ENTER) // select Money (rupees) → qty phase
    await tick()
    stdin.write('10') // type quantity
    await tick()
    stdin.write(ENTER) // submit qty → note phase (value skipped for rupees)
    await tick()
    stdin.write(ENTER) // blank note → commit line, back to head phase
    await tick()
    stdin.write(ENTER) // head phase cursor 0 = "finish" → onDone
    await tick()

    expect(onDone).toHaveBeenCalledTimes(1)
    const payload = onDone.mock.calls[0][0]
    expect(payload.line_items).toHaveLength(1)
    expect(payload.line_items[0]).toMatchObject({
      accounting_head_id: 'h1',
      asset_id: 'as1',
      quantity: 10,
      txn_value: null, // rupees → value omitted
    })
    unmount()
  })

  it('cancels the whole entry on escape at the first head', async () => {
    const onCancel = vi.fn()
    const { stdin, unmount } = render(h(LineItemEditor, { uid: 'u1', mode: 'lines', onDone: vi.fn(), onCancel }))
    await tick(80)
    stdin.write(PRIME)
    await tick()
    stdin.write(ESC)
    await tick()
    expect(onCancel).toHaveBeenCalled()
    unmount()
  })
})
