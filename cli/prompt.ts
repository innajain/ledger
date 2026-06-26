/**
 * Interactive prompt layer. Lines are pulled through readline's async iterator
 * (which buffers) rather than repeated rl.question() calls, so input isn't
 * dropped when several lines arrive at once (piped/non-interactive stdin).
 * Prompts go straight to stdout; echo flows through `masked_out`, muted during
 * password entry. readline is created lazily so non-interactive paths
 * (e.g. `add --json -`, which reads JSON from stdin) never claim stdin.
 */
import * as readline from 'node:readline'
import { Writable } from 'node:stream'
import { stdin, stdout } from 'node:process'

let muted = false
const masked_out = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) stdout.write(chunk)
    cb()
  },
})

let rl: readline.Interface | undefined
let lines: AsyncIterableIterator<string> | undefined
function get_lines(): AsyncIterableIterator<string> {
  if (!lines) {
    rl = readline.createInterface({ input: stdin, output: masked_out, terminal: stdin.isTTY })
    lines = rl[Symbol.asyncIterator]()
  }
  return lines
}

export async function ask(q: string): Promise<string> {
  stdout.write(q)
  const { value, done } = await get_lines().next()
  return done ? '' : value
}

export async function ask_hidden(q: string): Promise<string> {
  stdout.write(q)
  const iter = get_lines()
  muted = true
  const { value, done } = await iter.next()
  muted = false
  stdout.write('\n')
  return done ? '' : value
}

export async function confirm(q: string): Promise<boolean> {
  const a = (await ask(`${q} [y/N] `)).trim().toLowerCase()
  return a === 'y' || a === 'yes'
}

/** Close the readline interface if it was ever opened (called on shutdown). */
export function close_prompt(): void {
  rl?.close()
}
