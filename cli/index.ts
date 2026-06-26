#!/usr/bin/env tsx
/**
 * `ledger` — terminal client for the triple-entry ledger. Talks to the SAME
 * core logic the web app uses (`app/_core/*`), so anything done here is
 * identical to the browser (validation, cross-user approval links, balance
 * invalidation all included). Reads/writes whatever DATABASE_URL / REDIS_URL
 * point at — local by default; point them at prod to operate on prod.
 *
 * Run via: pnpm cli <command> [...]
 */
import 'dotenv/config'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { close_prompt } from './prompt'
import { cmd_login, cmd_logout, cmd_whoami } from './cmd/auth'
import { cmd_heads, cmd_assets, cmd_balances, cmd_txns, cmd_txn } from './cmd/read'
import { cmd_add, cmd_edit, cmd_delete } from './cmd/transactions'
import { cmd_requests, cmd_approve, cmd_reject, cmd_cancel, cmd_revert, cmd_accept_all } from './cmd/approvals'
import { cmd_worth, cmd_holdings } from './cmd/worth'
import { cmd_head_add, cmd_head_edit, cmd_head_rm, cmd_asset_add, cmd_asset_edit, cmd_asset_rm } from './cmd/resources'
import { cmd_prefs, cmd_prefs_set, cmd_defaults_set, cmd_upi_set, cmd_pay, cmd_signup, cmd_passwd, cmd_rename } from './cmd/account'
import { cmd_templates, cmd_template_add, cmd_template_rm, cmd_template_apply } from './cmd/templates'
import { cmd_export, cmd_export_xlsx, cmd_dump } from './cmd/export'

// Quiet the server logger's info chatter (DB/Redis "connected" lines) for a
// clean CLI; this only affects the CLI process. Override with LEDGER_LOG_LEVEL.
logger.level = process.env.LEDGER_LOG_LEVEL ?? 'warn'

const HELP = `ledger — terminal client for your triple-entry ledger

Usage: pnpm cli <command> [options]

Auth
  login                          Log in (prompts for username + password)
  logout                         Forget the stored session
  whoami                         Show the current session

Read
  heads                          List your accounting heads (with ids)
  assets                         List the asset catalog (with ids)
  balances                       Show per-account asset balances
  worth                          Net worth, allocation breakdown, Investments XIRR
  holdings                       Per-asset quantity, cost, live price, current value
  txns [-n N] [-s text] [--from dd-MM-yyyy] [--to dd-MM-yyyy]   List transactions (default 20)
  txn <id>                       Show a transaction's line items

Write
  add [--json <file|->]          Create a transaction (interactive, or from JSON)
  edit <id>                      Replace a transaction's line items (interactive)
  delete <id>                    Delete a transaction (with confirmation)

Approvals (cross-user linked accounts)
  requests                       Show your inbox (awaiting you) + outbox
  approve <link> [-a <acct>|--lines]   Approve a request (auto-balance onto -a, or enter --lines)
  reject <link>                  Reject a request awaiting you
  cancel <link>                  Cancel a request you sent
  revert <link> [-a <acct>|--lines]    Revert your rejected change to the approved version
  accept-all <user_id> -a <acct> Bulk-approve all change requests from a counterparty

Reference data
  head-add <name> -t <type> [--parent <ref>] [--link <user>]   Create an accounting head
  head-edit <id> [--name|--type|--parent|--active|--link ...]  Edit a head (or link/unlink a user)
  head-rm <id>                   Delete a head
  asset-add <name> -t <type> [--ticker T]   Create an asset (admin)
  asset-edit <id> [...]          Edit an asset (admin)
  asset-rm <id>                  Delete an asset (admin)

Account & preferences
  pay --to <acct> -a <amt> [--note ...]   Record a UPI payment (uses your default account)
  prefs                          Show preferences, defaults, UPI, admin
  prefs-set [--theme|--masking|--threshold|--graphs ...]
  defaults-set [--account|--allocation|--income-expense|--asset <ref>]
  upi-set <upi_id|none>          Set/clear your own UPI handle
  signup                         Create a new account (and log in)
  passwd                         Change your password
  rename                         Change your username

Templates
  templates                      List your transaction templates
  template-add                   Create a template (interactive)
  template-apply <id>            Create a transaction from a template
  template-rm <id>               Delete a template

Export
  export [-o file.zip]           Your data as a CSV-per-table ZIP
  export-xlsx [-o file.xlsx]     Your data as a linked .xlsx workbook
  dump [-o file.sql]             Restorable SQL dump of your data (keeps every column)

Reads/writes the database in DATABASE_URL (local by default).`

async function main() {
  const [, , command, ...rest] = process.argv
  switch (command) {
    case 'login':
      return cmd_login()
    case 'logout':
      return cmd_logout()
    case 'whoami':
      return cmd_whoami()
    case 'heads':
      return cmd_heads()
    case 'assets':
      return cmd_assets()
    case 'balances':
      return cmd_balances()
    case 'worth':
      return cmd_worth()
    case 'holdings':
      return cmd_holdings()
    case 'txns':
      return cmd_txns(rest)
    case 'txn':
      return cmd_txn(rest)
    case 'add':
      return cmd_add(rest)
    case 'edit':
      return cmd_edit(rest)
    case 'delete':
      return cmd_delete(rest)
    case 'requests':
      return cmd_requests()
    case 'approve':
      return cmd_approve(rest)
    case 'reject':
      return cmd_reject(rest)
    case 'cancel':
      return cmd_cancel(rest)
    case 'revert':
      return cmd_revert(rest)
    case 'accept-all':
      return cmd_accept_all(rest)
    case 'head-add':
      return cmd_head_add(rest)
    case 'head-edit':
      return cmd_head_edit(rest)
    case 'head-rm':
      return cmd_head_rm(rest)
    case 'asset-add':
      return cmd_asset_add(rest)
    case 'asset-edit':
      return cmd_asset_edit(rest)
    case 'asset-rm':
      return cmd_asset_rm(rest)
    case 'pay':
      return cmd_pay(rest)
    case 'prefs':
      return cmd_prefs()
    case 'prefs-set':
      return cmd_prefs_set(rest)
    case 'defaults-set':
      return cmd_defaults_set(rest)
    case 'upi-set':
      return cmd_upi_set(rest)
    case 'signup':
      return cmd_signup()
    case 'passwd':
      return cmd_passwd()
    case 'rename':
      return cmd_rename()
    case 'templates':
      return cmd_templates()
    case 'template-add':
      return cmd_template_add()
    case 'template-apply':
      return cmd_template_apply(rest)
    case 'template-rm':
      return cmd_template_rm(rest)
    case 'export':
      return cmd_export(rest)
    case 'export-xlsx':
      return cmd_export_xlsx(rest)
    case 'dump':
      return cmd_dump(rest)
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP)
      return
    default:
      console.error(`Unknown command: ${command}\n`)
      console.log(HELP)
      process.exitCode = 1
  }
}

main()
  .catch(err => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    close_prompt()
    await prisma.$disconnect()
    // Redis (ioredis) keeps the event loop alive; force-exit once work is done.
    process.exit(process.exitCode ?? 0)
  })
