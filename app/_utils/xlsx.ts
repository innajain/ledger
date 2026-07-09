import { build_zip, type ZipEntry } from './zip'

export type XlsxColumn = {
  name: string
  numeric?: boolean
  fkSheet?: string
}

export type XlsxTable = {
  name: string
  columns: XlsxColumn[]
  rows: string[][]
  idColumn?: string
}

function strip_illegal(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue
    out += ch
  }
  return out
}

function xml(s: string): string {
  return strip_illegal(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function col_letter(i: number): string {
  let s = ''
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

const sheet_name = (name: string) => name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31)

const sheet_ref = (name: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`)

const NUMERIC_RE = /^-?\d+(\.\d+)?$/
const enc = (s: string) => Buffer.from(s, 'utf8')
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function worksheet_xml(table: XlsxTable, idRowOf: Map<string, Map<string, number>>, idColOf: Map<string, number>): string {
  const links: string[] = []
  const lastRef = `${col_letter(Math.max(table.columns.length - 1, 0))}${table.rows.length + 1}`

  const header =
    `<row r="1">` +
    table.columns.map((c, ci) => `<c r="${col_letter(ci)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${xml(c.name)}</t></is></c>`).join('') +
    `</row>`

  const body = table.rows
    .map((row, ri) => {
      const r = ri + 2
      const cells = row
        .map((val, ci) => {
          if (!val) return ''
          const ref = `${col_letter(ci)}${r}`
          const col = table.columns[ci]
          let style = ''
          if (col.fkSheet) {
            const targetRow = idRowOf.get(col.fkSheet)?.get(val)
            if (targetRow) {
              const targetCol = col_letter(idColOf.get(col.fkSheet) ?? 0)
              links.push(
                `<hyperlink ref="${ref}" location="${xml(`${sheet_ref(sheet_name(col.fkSheet))}!${targetCol}${targetRow}`)}" display="${xml(val)}"/>`,
              )
              style = ' s="2"'
            }
          }
          if (col.numeric && NUMERIC_RE.test(val)) return `<c r="${ref}"${style}><v>${val}</v></c>`
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(val)}</t></is></c>`
        })
        .join('')
      return `<row r="${r}">${cells}</row>`
    })
    .join('')

  const hyperlinks = links.length ? `<hyperlinks>${links.join('')}</hyperlinks>` : ''
  return (
    `${DECL}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
    `<dimension ref="A1:${lastRef}"/>` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>` +
    `</sheetView></sheetViews>` +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="A1:${lastRef}"/>` +
    hyperlinks +
    `</worksheet>`
  )
}

const STYLES_XML =
  `${DECL}<styleSheet xmlns="${NS_MAIN}">` +
  `<fonts count="3">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`

export function build_xlsx(tables: XlsxTable[]): Buffer {
  const idRowOf = new Map<string, Map<string, number>>()
  const idColOf = new Map<string, number>()
  for (const t of tables) {
    const ci = t.columns.findIndex(c => c.name === (t.idColumn ?? 'id'))
    idColOf.set(t.name, ci < 0 ? 0 : ci)
    const m = new Map<string, number>()
    if (ci >= 0) t.rows.forEach((row, i) => row[ci] && m.set(row[ci], i + 2))
    idRowOf.set(t.name, m)
  }

  const contentTypes =
    `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    tables
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    `</Types>`

  const rootRels =
    `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`

  const workbook =
    `${DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><sheets>` +
    tables.map((t, i) => `<sheet name="${xml(sheet_name(t.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets></workbook>`

  const workbookRels =
    `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    tables
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc(contentTypes) },
    { name: '_rels/.rels', data: enc(rootRels) },
    { name: 'xl/workbook.xml', data: enc(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(workbookRels) },
    { name: 'xl/styles.xml', data: enc(STYLES_XML) },
    ...tables.map((t, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(worksheet_xml(t, idRowOf, idColOf)) })),
  ]
  return build_zip(entries)
}
