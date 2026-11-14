import { describe, it, expect } from 'vitest'
import { moved_redirect_url } from './moved'

const TARGET = 'https://new.example.test'

describe('moved_redirect_url', () => {
  it('does nothing off Vercel, so the self-hosted deployment never redirects to itself', () => {
    expect(moved_redirect_url('https://ledger.example.test/transactions', false, TARGET)).toBeNull()
  })

  it('forwards path and query to the new host on Vercel', () => {
    expect(moved_redirect_url('https://old.example.test/transactions/abc?tagId=7&x=1', true, TARGET)).toBe(
      'https://new.example.test/transactions/abc?tagId=7&x=1',
    )
    expect(moved_redirect_url('https://old.example.test/', true, TARGET)).toBe('https://new.example.test/')
  })

  it('keeps encoded characters intact and cannot be steered to another host', () => {
    expect(moved_redirect_url('https://old.example.test/a%20b?q=%2F', true, TARGET)).toBe('https://new.example.test/a%20b?q=%2F')
    // a protocol-relative or absolute-looking path stays a path on the target
    expect(moved_redirect_url('https://old.example.test//evil.test/x', true, TARGET)).toBe('https://new.example.test//evil.test/x')
  })
})
