import { describe, it, expect } from 'vitest'
import { flat_config, parse_saved_interest_settings, validate_interest_config, validate_interest_settings } from './interest_config'

describe('validate_interest_config', () => {
  it('accepts a flat rate and fills the defaults', () => {
    expect(validate_interest_config({ slabs: [{ up_to: null, rate_pct: 2.5 }] })).toEqual(flat_config(2.5))
  })

  it('accepts a progressive card and keeps its options', () => {
    const config = {
      slabs: [
        { up_to: 300000, rate_pct: 2.5 },
        { up_to: 2500000, rate_pct: 7 },
        { up_to: null, rate_pct: 5 },
      ],
      day_basis: 'financial_year',
      rounding: 'round_up_rupee',
      round_each_day: true,
    }
    expect(validate_interest_config(config)).toEqual(config)
  })

  it('treats an omitted last up_to as no limit', () => {
    expect(validate_interest_config({ slabs: [{ rate_pct: 4 }] }).slabs).toEqual([{ up_to: null, rate_pct: 4 }])
  })

  it('rejects input that is not an object, or has no bands', () => {
    expect(() => validate_interest_config(null)).toThrow(/missing/)
    expect(() => validate_interest_config('2.5')).toThrow(/missing/)
    expect(() => validate_interest_config({ slabs: [] })).toThrow(/at least one rate/i)
    expect(() => validate_interest_config({})).toThrow(/at least one rate/i)
  })

  it('rejects a rate outside 0–100, or not a number', () => {
    expect(() => validate_interest_config({ slabs: [{ rate_pct: 101 }] })).toThrow(/between 0 and 100/)
    expect(() => validate_interest_config({ slabs: [{ rate_pct: -1 }] })).toThrow(/between 0 and 100/)
    expect(() => validate_interest_config({ slabs: [{ rate_pct: '2.5' }] })).toThrow(/between 0 and 100/)
    expect(() => validate_interest_config({ slabs: [{ rate_pct: NaN }] })).toThrow(/between 0 and 100/)
  })

  it('needs at least one rate above zero', () => {
    expect(() => validate_interest_config({ slabs: [{ rate_pct: 0 }] })).toThrow(/above 0%/)
  })

  it('requires the bands to climb and the last one to have no limit', () => {
    const band = (up_to: number | null, rate_pct = 3) => ({ up_to, rate_pct })
    expect(() => validate_interest_config({ slabs: [band(500000), band(300000), band(null)] })).toThrow(/Band 2: the upper limit must be above/)
    expect(() => validate_interest_config({ slabs: [band(500000), band(500000), band(null)] })).toThrow(/Band 2/)
    expect(() => validate_interest_config({ slabs: [band(0), band(null)] })).toThrow(/Band 1/)
    expect(() => validate_interest_config({ slabs: [band(null), band(null)] })).toThrow(/Band 1: the upper limit/)
    expect(() => validate_interest_config({ slabs: [band(500000), band(900000)] })).toThrow(/Band 2: the last band must have no upper limit/)
  })

  it('caps the number of bands', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ up_to: i < 10 ? (i + 1) * 1000 : null, rate_pct: 3 }))
    expect(() => validate_interest_config({ slabs: many })).toThrow(/at most 10/)
  })

  it('rejects unknown options', () => {
    expect(() => validate_interest_config({ slabs: [{ rate_pct: 3 }], day_basis: 'lunar' })).toThrow(/day basis/)
    expect(() => validate_interest_config({ slabs: [{ rate_pct: 3 }], rounding: 'down' })).toThrow(/rounding/)
    expect(() => validate_interest_config({ slabs: [{ rate_pct: 3 }], round_each_day: 'yes' })).toThrow(/true or false/)
  })

  it('does not trust extra or prototype keys', () => {
    const out = validate_interest_config({ slabs: [{ rate_pct: 3, evil: true }], __proto__: { day_basis: 'calendar_year' }, extra: 1 })
    expect(out).toEqual(flat_config(3))
  })
})

describe('validate_interest_settings', () => {
  it('adds a quarterly frequency by default and keeps a monthly one', () => {
    expect(validate_interest_settings({ slabs: [{ rate_pct: 2.5 }] })).toEqual({ ...flat_config(2.5), frequency: 'quarterly' })
    expect(validate_interest_settings({ slabs: [{ rate_pct: 2.5 }], frequency: 'monthly' }).frequency).toBe('monthly')
  })

  it('rejects an unknown frequency, and still runs every rate-card check', () => {
    expect(() => validate_interest_settings({ slabs: [{ rate_pct: 2.5 }], frequency: 'daily' })).toThrow(/frequency/)
    expect(() => validate_interest_settings({ slabs: [] })).toThrow(/at least one rate/i)
  })

  it('ignores a prototype-borne frequency', () => {
    expect(validate_interest_settings({ slabs: [{ rate_pct: 3 }], __proto__: { frequency: 'monthly' } }).frequency).toBe('quarterly')
  })
})

describe('parse_saved_interest_settings', () => {
  const stored = { ...flat_config(2.5), frequency: 'quarterly' }

  it('reads back what was saved', () => {
    expect(parse_saved_interest_settings(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
  })

  it('treats nothing saved as null', () => {
    expect(parse_saved_interest_settings(null)).toBeNull()
    expect(parse_saved_interest_settings(undefined)).toBeNull()
  })

  it('treats a value that no longer passes as not saved, instead of throwing or trusting it', () => {
    expect(parse_saved_interest_settings({ ...stored, slabs: [] })).toBeNull()
    expect(parse_saved_interest_settings({ ...stored, rounding: 'floor' })).toBeNull()
    expect(parse_saved_interest_settings('2.5')).toBeNull()
    expect(parse_saved_interest_settings([1, 2])).toBeNull()
  })
})
