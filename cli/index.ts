#!/usr/bin/env tsx
/**
 * `ledger` — terminal client for the triple-entry ledger. Talks to the SAME
 * core logic the web app uses (`app/_core/*`), so anything done here is
 * identical to the browser (validation, cross-user approval links, balance
 * invalidation all included). Reads/writes whatever DATABASE_URL / REDIS_URL
 * point at — local by default; point them at prod to operate on prod.
 *
 * Run via: pnpm cli <command> [...]
 *    or:   pnpm cli              (interactive REPL)
 */
import 'dotenv/config'
import * as readline from 'node:readline'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { load_session } from './auth_store'
import { close_prompt, set_rl } from './prompt'
import { cmd_login, cmd_logout, cmd_whoami } from './cmd/auth'
import { cmd_heads, cmd_assets, cmd_balances, cmd_txns, cmd_txn } from './cmd/read'
import { cmd_add, cmd_edit, cmd_delete } from './cmd/transactions'
import { cmd_requests, cmd_approve, cmd_reject, cmd_cancel, cmd_revert, cmd_accept_all } from './cmd/approvals'
import { cmd_worth, cmd_holdings } from './cmd/worth'
import { cmd_head_add, cmd_head_edit, cmd_head_rm, cmd_asset_add, cmd_asset_edit, cmd_asset_rm } from './cmd/resources'
import { cmd_prefs, cmd_prefs_set, cmd_defaults_set, cmd_upi_set, cmd_pay, cmd_signup, cmd_passwd, cmd_rename } from './cmd/account'
import { cmd_templates, cmd_template_add, cmd_template_rm, cmd_template_apply } from './cmd/templates'
import { cmd_export, cmd_export_xlsx, cmd_dump } from './cmd/export'
import { start_ui } from './ui'

// Quiet the server logger's info chatter (DB/Redis "connected" lines) for a
// clean CLI; this only affects the CLI process. Override with LEDGER_LOG_LEVEL.
logger.level = process.env.LEDGER_LOG_LEVEL ?? 'warn'

// ---------------------------------------------------------------------------
// Command list — used for dispatch, help text, and tab-completion.
// ---------------------------------------------------------------------------

/** A command entry: [name, group, description, handler-taking-rest-args?]. */
type CmdEntry = {
  name: string
  group: string
  desc: string
  handler: (args: string[]) => Promise<void> | void
}

const COMMANDS: CmdEntry[] = [
  // Auth
  { name: 'login', group: 'Auth', desc: 'Log in (prompts for username + password)', handler: () => cmd_login() },
  { name: 'logout', group: 'Auth', desc: 'Forget the stored session', handler: () => cmd_logout() },
  { name: 'whoami', group: 'Auth', desc: 'Show the current session', handler: () => cmd_whoami() },
  // Read
  { name: 'heads', group: 'Read', desc: 'List your accounting heads (with ids)', handler: () => cmd_heads() },
  { name: 'assets', group: 'Read', desc: 'List the asset catalog (with ids)', handler: () => cmd_assets() },
  { name: 'balances', group: 'Read', desc: 'Show per-account asset balances', handler: () => cmd_balances() },
  { name: 'worth', group: 'Read', desc: 'Net worth, allocation breakdown, Investments XIRR', handler: () => cmd_worth() },
  { name: 'holdings', group: 'Read', desc: 'Per-asset quantity, cost, live price, current value', handler: () => cmd_holdings() },
  {
    name: 'txns',
    group: 'Read',
    desc: 'List transactions [-n N] [-s text] [--from dd-MM-yyyy] [--to dd-MM-yyyy]',
    handler: args => cmd_txns(args),
  },
  { name: 'txn', group: 'Read', desc: "Show a transaction's line items  txn <id>", handler: args => cmd_txn(args) },
  // Write
  { name: 'add', group: 'Write', desc: 'Create a transaction (interactive, or --json <file|->)', handler: args => cmd_add(args) },
  { name: 'edit', group: 'Write', desc: "Replace a transaction's line items  edit <id>", handler: args => cmd_edit(args) },
  { name: 'delete', group: 'Write', desc: 'Delete a transaction  delete <id>', handler: args => cmd_delete(args) },
  // Approvals
  { name: 'requests', group: 'Approvals', desc: 'Show your inbox (awaiting you) + outbox', handler: () => cmd_requests() },
  {
    name: 'approve',
    group: 'Approvals',
    desc: 'Approve a request  approve <link> [-a <acct>|--lines]',
    handler: args => cmd_approve(args),
  },
  { name: 'reject', group: 'Approvals', desc: 'Reject a request awaiting you  reject <link>', handler: args => cmd_reject(args) },
  { name: 'cancel', group: 'Approvals', desc: 'Cancel a request you sent  cancel <link>', handler: args => cmd_cancel(args) },
  {
    name: 'revert',
    group: 'Approvals',
    desc: 'Revert your rejected change  revert <link> [-a <acct>|--lines]',
    handler: args => cmd_revert(args),
  },
  {
    name: 'accept-all',
    group: 'Approvals',
    desc: 'Bulk-approve from a counterparty  accept-all <user_id> -a <acct>',
    handler: args => cmd_accept_all(args),
  },
  // Reference data
  {
    name: 'head-add',
    group: 'Reference data',
    desc: 'Create a head  head-add <name> -t <type> [--parent <ref>] [--link <user>]',
    handler: args => cmd_head_add(args),
  },
  { name: 'head-edit', group: 'Reference data', desc: 'Edit a head  head-edit <id> [...]', handler: args => cmd_head_edit(args) },
  { name: 'head-rm', group: 'Reference data', desc: 'Delete a head  head-rm <id>', handler: args => cmd_head_rm(args) },
  {
    name: 'asset-add',
    group: 'Reference data',
    desc: 'Create an asset  asset-add <name> -t <type> [--ticker T]',
    handler: args => cmd_asset_add(args),
  },
  { name: 'asset-edit', group: 'Reference data', desc: 'Edit an asset  asset-edit <id> [...]', handler: args => cmd_asset_edit(args) },
  { name: 'asset-rm', group: 'Reference data', desc: 'Delete an asset  asset-rm <id>', handler: args => cmd_asset_rm(args) },
  // Account & preferences
  {
    name: 'pay',
    group: 'Account',
    desc: 'Record a UPI payment  pay --to <acct> -a <amt> [--note ...]',
    handler: args => cmd_pay(args),
  },
  { name: 'prefs', group: 'Account', desc: 'Show preferences, defaults, UPI, admin', handler: () => cmd_prefs() },
  { name: 'prefs-set', group: 'Account', desc: 'Set preferences  prefs-set [--theme|--masking|...]', handler: args => cmd_prefs_set(args) },
  {
    name: 'defaults-set',
    group: 'Account',
    desc: 'Set defaults  defaults-set [--account|--allocation|--income-expense|--asset <ref>]',
    handler: args => cmd_defaults_set(args),
  },
  { name: 'upi-set', group: 'Account', desc: 'Set/clear your UPI handle  upi-set <upi_id|none>', handler: args => cmd_upi_set(args) },
  { name: 'signup', group: 'Account', desc: 'Create a new account (and log in)', handler: () => cmd_signup() },
  { name: 'passwd', group: 'Account', desc: 'Change your password', handler: () => cmd_passwd() },
  { name: 'rename', group: 'Account', desc: 'Change your username', handler: () => cmd_rename() },
  // Templates
  { name: 'templates', group: 'Templates', desc: 'List your transaction templates', handler: () => cmd_templates() },
  { name: 'template-add', group: 'Templates', desc: 'Create a template (interactive)', handler: () => cmd_template_add() },
  {
    name: 'template-apply',
    group: 'Templates',
    desc: 'Create a transaction from a template  template-apply <id>',
    handler: args => cmd_template_apply(args),
  },
  { name: 'template-rm', group: 'Templates', desc: 'Delete a template  template-rm <id>', handler: args => cmd_template_rm(args) },
  // Export
  { name: 'export', group: 'Export', desc: 'Your data as a CSV-per-table ZIP  export [-o file.zip]', handler: args => cmd_export(args) },
  {
    name: 'export-xlsx',
    group: 'Export',
    desc: 'Your data as a linked .xlsx workbook  export-xlsx [-o file.xlsx]',
    handler: args => cmd_export_xlsx(args),
  },
  { name: 'dump', group: 'Export', desc: 'Restorable SQL dump  dump [-o file.sql]', handler: args => cmd_dump(args) },
  // Interactive UI
  { name: 'repl', group: 'Interactive', desc: 'Start the text-based interactive REPL', handler: () => repl() },
  { name: 'ui', group: 'Interactive', desc: 'Start the graphical terminal UI (Ink)', handler: () => start_ui() },
]

const CMD_NAMES = COMMANDS.map(c => c.name)

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function print_help() {
  console.log('ledger — terminal client for your triple-entry ledger\n')
  console.log('Usage: pnpm cli <command> [options]')
  console.log('       pnpm cli                (interactive mode)\n')
  const groups = [...new Set(COMMANDS.map(c => c.group))]
  for (const g of groups) {
    console.log(g)
    for (const c of COMMANDS.filter(c => c.group === g)) {
      console.log(`  ${c.name.padEnd(20)} ${c.desc}`)
    }
    console.log()
  }
  console.log('In interactive mode: type any command above, or help / exit / quit / Ctrl-D.')
  console.log('Reads/writes the database in DATABASE_URL (local by default).')
}

// ---------------------------------------------------------------------------
// Dispatch — shared between single-shot and REPL modes
// ---------------------------------------------------------------------------

async function dispatch(command: string, rest: string[]): Promise<void> {
  const entry = COMMANDS.find(c => c.name === command)
  if (entry) return entry.handler(rest)

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      print_help()
      return
    case 'clear':
      console.clear()
      return
    default:
      console.error(`Unknown command: ${command}`)
      console.log('Type `help` for available commands.')
      process.exitCode = 1
  }
}

// ---------------------------------------------------------------------------
// Parse a raw line into tokens, respecting double/single quotes.
// ---------------------------------------------------------------------------

function tokenize(line: string): string[] {
  const tokens: string[] = []
  let current = ''
  let in_quote: '"' | "'" | null = null
  for (const ch of line) {
    if (in_quote) {
      if (ch === in_quote) {
        in_quote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      in_quote = ch
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

// ---------------------------------------------------------------------------
// Interactive REPL
// ---------------------------------------------------------------------------

async function repl() {
  const session = await load_session()
  const greeting = session ? `Logged in as ${session.username}.` : 'Not logged in — run `login` to start.'
  console.log(`ledger interactive shell. ${greeting}`)
  console.log('Type `help` for commands, `exit` or Ctrl-D to quit.\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
    completer: (line: string) => {
      const hits = CMD_NAMES.filter(c => c.startsWith(line.trim()))
      return [hits.length ? hits : CMD_NAMES, line]
    },
    history: [],
    historySize: 200,
    removeHistoryDuplicates: true,
  })

  // Share the readline with prompt.ts so sub-command prompts (ask, ask_hidden,
  // confirm) use the same interface rather than creating a competing one.
  set_rl(rl)

  let running = false

  rl.on('line', async (line: string) => {
    if (running) return // guard against stray events
    const tokens = tokenize(line.trim())
    if (tokens.length === 0) {
      rl.prompt()
      return
    }

    const [command, ...rest] = tokens

    // REPL-only exit commands
    if (['exit', 'quit', 'q', '.exit'].includes(command)) {
      rl.close()
      return
    }

    running = true
    try {
      await dispatch(command, rest)
    } catch (err) {
      console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    }
    // Reset exitCode for the next command — in REPL mode we don't exit on failure
    process.exitCode = undefined
    running = false

    // Re-prompt (username may have changed after login/rename)
    const s = await load_session()
    rl.setPrompt(`${s ? s.username : 'ledger'}» `)
    rl.prompt()
  })

  // Initial prompt
  const s2 = await load_session()
  rl.setPrompt(`${s2 ? s2.username : 'ledger'}» `)
  rl.prompt()

  // Wait for the readline to close (user typed exit / Ctrl-D)
  await new Promise<void>(resolve => rl.on('close', resolve))
  console.log('\nBye!')
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const [, , command, ...rest] = process.argv

  if (command === undefined && process.stdin.isTTY) {
    // No command + interactive terminal → Ink UI
    return start_ui()
  }

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    print_help()
    return
  }

  return dispatch(command, rest)
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
