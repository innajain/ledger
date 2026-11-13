import { describe, it, expect } from 'vitest'
import { build_sql_dump } from './sql_dump'

describe('build_sql_dump', () => {
  const generatedAt = new Date('2026-06-04T00:00:00.000Z')

  it('emits typed, escaped INSERTs with explicit columns', () => {
    const sql = build_sql_dump(
      [
        {
          table: 'user',
          columns: ['id', 'username', 'is_admin', 'balance', 'created_at', 'note'],
          numericColumns: ['balance'],
          rows: [['u1', "O'Brien", true, '1500.5000', new Date('2026-01-02T03:04:05.000Z'), null]],
        },
      ],
      { title: 'Test dump', generatedAt },
    )
    expect(sql).toContain('-- Test dump')
    expect(sql).toContain('-- Table: user (1 row)')
    expect(sql).toContain(
      `INSERT INTO "user" ("id", "username", "is_admin", "balance", "created_at", "note") VALUES ('u1', 'O''Brien', TRUE, 1500.5000, '2026-01-02T03:04:05.000Z', NULL);`,
    )
  })

  it('renders bare numbers and bigints unquoted even without the numeric hint', () => {
    const sql = build_sql_dump([{ table: 't', columns: ['n', 'big'], rows: [[42, 9007199254740993n]] }], { title: 'X' })
    expect(sql).toContain(`INSERT INTO "t" ("n", "big") VALUES (42, 9007199254740993);`)
  })

  it('quotes identifiers and skips INSERTs for empty tables', () => {
    const sql = build_sql_dump([{ table: 'we"ird', columns: ['a"b'], rows: [] }], { title: 'X' })
    expect(sql).toContain('-- Table: we"ird (0 rows)')
    expect(sql).not.toContain('INSERT')
  })

  it('doubles embedded quotes in identifiers', () => {
    const sql = build_sql_dump([{ table: 'we"ird', columns: ['a"b'], rows: [['x']] }], { title: 'X' })
    expect(sql).toContain(`INSERT INTO "we""ird" ("a""b") VALUES ('x');`)
  })
})

describe('json values', () => {
  it('writes a json/jsonb value as quoted JSON, not "[object Object]"', () => {
    const sql = build_sql_dump(
      [
        {
          table: 'accounting_head',
          columns: ['id', 'interest_settings'],
          rows: [['h1', { slabs: [{ up_to: null, rate_pct: 2.5 }], day_basis: 'fixed_365' }]],
        },
      ],
      { title: 't', generatedAt: new Date('2026-01-01T00:00:00Z') },
    )
    expect(sql).toContain(`'{"slabs":[{"up_to":null,"rate_pct":2.5}],"day_basis":"fixed_365"}'`)
    expect(sql).not.toContain('[object Object]')
  })

  it("doubles a quote inside a JSON string so it can't end the literal early", () => {
    const sql = build_sql_dump([{ table: 'x', columns: ['v'], rows: [[{ note: "it's" }]] }], {
      title: 't',
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    })
    expect(sql).toContain(`'{"note":"it''s"}'`)
  })

  it('still writes null as NULL', () => {
    const sql = build_sql_dump([{ table: 'x', columns: ['v'], rows: [[null]] }], { title: 't', generatedAt: new Date('2026-01-01T00:00:00Z') })
    expect(sql).toContain('VALUES (NULL);')
  })
})
