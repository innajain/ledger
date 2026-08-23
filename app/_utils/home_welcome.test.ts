import { describe, it, expect } from 'vitest'
import { WELCOME_MESSAGES, pick_welcome_message } from './home_welcome'

describe('pick_welcome_message', () => {
  it('maps 0 to the first message', () => {
    expect(pick_welcome_message(0)).toBe(WELCOME_MESSAGES[0])
  })

  it('maps a mid value to the matching index', () => {
    expect(pick_welcome_message(0.5)).toBe(WELCOME_MESSAGES[Math.floor(0.5 * WELCOME_MESSAGES.length)])
  })

  it('clamps 1 (never returns undefined)', () => {
    expect(pick_welcome_message(1)).toBe(WELCOME_MESSAGES[WELCOME_MESSAGES.length - 1])
  })

  it('picks something from the list without an argument', () => {
    expect(WELCOME_MESSAGES).toContain(pick_welcome_message())
  })
})
