import { parseArgs } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { formatInTimeZone } from 'date-fns-tz'
import { build_user_csv_zip, build_user_xlsx, build_user_sql } from '@/app/_utils/db_export'
import { USER_TIMEZONE } from '@/lib/config'
import { require_session } from '../auth_store'

const stamp = () => formatInTimeZone(new Date(), USER_TIMEZONE, 'yyyy-MM-dd_HH-mm')
const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')

function out_path(rest: string[]): string | undefined {
  const { values } = parseArgs({ args: rest, options: { out: { type: 'string', short: 'o' } }, allowPositionals: false })
  return values.out
}

export async function cmd_export(rest: string[]) {
  const { uid } = await require_session()
  const dest = resolve(out_path(rest) ?? `ledger-export-${stamp()}.zip`)
  const zip = await build_user_csv_zip(uid)
  await writeFile(dest, zip)
  console.log(`✓ Wrote ${zip.length} bytes → ${dest}`)
}

export async function cmd_export_xlsx(rest: string[]) {
  const { uid } = await require_session()
  const dest = resolve(out_path(rest) ?? `ledger-export-${stamp()}.xlsx`)
  const xlsx = await build_user_xlsx(uid)
  await writeFile(dest, xlsx)
  console.log(`✓ Wrote ${xlsx.length} bytes → ${dest}`)
}

export async function cmd_dump(rest: string[]) {
  const { uid, username } = await require_session()
  const dest = resolve(out_path(rest) ?? `ledger-${safe(username)}-${stamp()}.sql`)
  const sql = await build_user_sql(uid, username)
  await writeFile(dest, sql, 'utf8')
  console.log(`✓ Wrote ${Buffer.byteLength(sql)} bytes → ${dest}  (restorable; includes your password_hash)`)
}
