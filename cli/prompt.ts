/**
 * Interactive prompt layer. Uses rl.question() for each prompt so it works
 * both in single-shot mode (lazily creates its own readline) and in REPL mode
 * (shares the REPL's readline injected via `set_rl()`). Password entry mutes
 * echo by temporarily swapping the readline's output to a sink stream.
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
let rl_owned = false // true if we created it; false if injected by REPL

/** Inject an external readline (REPL mode). Prevents creating a second one. */
export function set_rl(external: readline.Interface): void {
  rl = external
  rl_owned = false
}

function ensure_rl(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({ input: stdin, output: masked_out, terminal: stdin.isTTY })
    rl_owned = true
  }
  return rl
}

export async function ask(q: string): Promise<string> {
  const r = ensure_rl()
  return new Promise<string>(resolve => {
    r.question(q, answer => resolve(answer))
  })
}

export async function ask_hidden(q: string): Promise<string> {
  const r = ensure_rl()
  return new Promise<string>(resolve => {
    // Suppress echo by temporarily swapping the output stream.
    // In single-shot mode rl.output is `masked_out` and `muted` does the job.
    // In REPL mode rl.output is `process.stdout`, so we swap it to a sink.
    // `output` exists at runtime but isn't in @types/node's Interface type.
    const rl_any = r as unknown as { output: NodeJS.WritableStream }
    const orig_output = rl_any.output
    const sink = new Writable({
      write(_chunk, _enc, cb) {
        cb()
      },
    })
    stdout.write(q) // write the question ourselves before swapping
    rl_any.output = sink
    muted = true
    r.question('', answer => {
      rl_any.output = orig_output
      muted = false
      stdout.write('\n')
      resolve(answer)
    })
  })
}

export async function confirm(q: string): Promise<boolean> {
  const a = (await ask(`${q} [y/N] `)).trim().toLowerCase()
  return a === 'y' || a === 'yes'
}

/** Close the readline interface if we own it (single-shot mode). */
export function close_prompt(): void {
  if (rl_owned) rl?.close()
}
