import { describe, it, expect } from 'vitest'
import { build_xlsx, col_letter, type XlsxTable } from './xlsx'

// Pull the package parts back out of the .xlsx (a store-only zip) by walking the
// central directory, so we can assert on the actual OOXML we emit.
function unzip(buf: Buffer): Record<string, string> {
  const eocd = buf.length - 22
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    out[name] = buf.subarray(dataStart, dataStart + size).toString('utf8')
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const sample: XlsxTable[] = [
  {
    name: 'transaction',
    columns: [{ name: 'id' }, { name: 'description' }],
    rows: [
      ['t1', 'lunch & "stuff" <x>'],
      ['t2', 'rent'],
    ],
  },
  {
    name: 'line_item',
    columns: [{ name: 'id' }, { name: 'transaction_id', fkSheet: 'transaction' }, { name: 'quantity', numeric: true }],
    rows: [
      ['li1', 't2', '-1500.5'],
      ['li2', 'tX', '42'], // tX is absent from the transaction sheet → no link
    ],
  },
]

describe('col_letter', () => {
  it('maps indices to spreadsheet column letters', () => {
    expect(col_letter(0)).toBe('A')
    expect(col_letter(25)).toBe('Z')
    expect(col_letter(26)).toBe('AA')
  })
})

describe('build_xlsx', () => {
  const parts = unzip(build_xlsx(sample))

  it('emits the OPC package parts', () => {
    expect(parts['[Content_Types].xml']).toBeDefined()
    expect(parts['_rels/.rels']).toBeDefined()
    expect(parts['xl/workbook.xml']).toBeDefined()
    expect(parts['xl/_rels/workbook.xml.rels']).toBeDefined()
    expect(parts['xl/styles.xml']).toBeDefined()
    expect(parts['xl/worksheets/sheet1.xml']).toBeDefined()
    expect(parts['xl/worksheets/sheet2.xml']).toBeDefined()
  })

  it('lists both tables as sheets', () => {
    expect(parts['xl/workbook.xml']).toContain('name="transaction"')
    expect(parts['xl/workbook.xml']).toContain('name="line_item"')
  })

  it('XML-escapes text cells', () => {
    expect(parts['xl/worksheets/sheet1.xml']).toContain('lunch &amp; &quot;stuff&quot; &lt;x&gt;')
  })

  it('writes numeric columns as numbers, not strings', () => {
    const sheet2 = parts['xl/worksheets/sheet2.xml']
    expect(sheet2).toContain('<v>-1500.5</v>')
    expect(sheet2).not.toContain('-1500.5</t>')
  })

  it('hyperlinks a foreign key to the referenced row, and only when present', () => {
    const sheet2 = parts['xl/worksheets/sheet2.xml']
    // t2 is row 3 on the transaction sheet (header=1, t1=2, t2=3); FK cell is B2.
    expect(sheet2).toContain('<hyperlink ref="B2" location="transaction!A3"')
    // The dangling FK (tX) produced no hyperlink.
    expect(sheet2).not.toContain('tX</t>'.replace('tX', 'NONEXISTENT')) // sanity
    expect((sheet2.match(/<hyperlink /g) ?? []).length).toBe(1)
  })

  it('freezes and auto-filters the header row', () => {
    expect(parts['xl/worksheets/sheet1.xml']).toContain('state="frozen"')
    expect(parts['xl/worksheets/sheet1.xml']).toContain('<autoFilter ref="A1:B3"/>')
  })
})
