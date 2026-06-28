import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { createElement as h } from 'react'
import { Confirm } from './Field'

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms))
const ESC = String.fromCharCode(27)

describe('Confirm', () => {
  it('answers true on y', async () => {
    const onAnswer = vi.fn()
    const { stdin, unmount } = render(h(Confirm, { message: 'ok?', onAnswer }))
    await tick()
    stdin.write('y')
    await tick()
    expect(onAnswer).toHaveBeenCalledWith(true)
    unmount()
  })

  it('answers false on n', async () => {
    const onAnswer = vi.fn()
    const { stdin, unmount } = render(h(Confirm, { message: 'ok?', onAnswer }))
    await tick()
    stdin.write('n')
    await tick()
    expect(onAnswer).toHaveBeenCalledWith(false)
    unmount()
  })

  it('answers false on escape', async () => {
    const onAnswer = vi.fn()
    const { stdin, unmount } = render(h(Confirm, { message: 'ok?', onAnswer }))
    await tick()
    stdin.write(ESC)
    await tick()
    expect(onAnswer).toHaveBeenCalledWith(false)
    unmount()
  })
})
