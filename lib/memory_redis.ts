// In-process stand-in for the slice of ioredis the app uses (get, mget, set with EX/PX/NX, setex,
// del, incr, ping, flushall, pipeline), for a single-process deployment with no Redis server.
//
// It is a cache and a counter store, nothing more: every key the app writes here can be recomputed
// (balances, price caches, the time-series version counters) or is short-lived (rate-limit windows,
// the session revocation marker, which carries a TTL equal to the token lifetime). A restart
// therefore only costs a cold cache, with one exception worth knowing: a password change sets
// `auth:revoke_before:<uid>` here, and a restart forgets it until the old tokens expire.
//
// Dependency-free on purpose so it is unit-testable; lib/redis.ts decides when to use it.

type Entry = { value: string; expires_at: number | null }
type Reply = [Error | null, unknown]
export type MemoryStore = Map<string, Entry>

export class MemoryRedis {
  // `store` is injectable so several instances (Next can load a module once per bundle) can share
  // one underlying map; each instance still gets its own method wrappers.
  constructor(
    private now: () => number = Date.now,
    sweep_ms = 60_000,
    private store: MemoryStore = new Map(),
  ) {
    // Expired keys are dropped on access; this sweep only stops never-read keys (old rate-limit
    // windows) from piling up. unref() so it never keeps the process alive.
    if (sweep_ms > 0) setInterval(() => this.sweep(), sweep_ms).unref?.()
  }

  sweep(): void {
    const t = this.now()
    for (const [k, e] of this.store) if (e.expires_at !== null && e.expires_at <= t) this.store.delete(k)
  }

  private live(key: string): Entry | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (e.expires_at !== null && e.expires_at <= this.now()) {
      this.store.delete(key)
      return undefined
    }
    return e
  }

  on(): this {
    return this
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null
  }

  async mget(...keys: (string | string[])[]): Promise<(string | null)[]> {
    return keys.flat().map(k => this.live(k)?.value ?? null)
  }

  // set(key, value, 'EX', seconds | 'PX', ms, 'NX' | 'XX') — the options the app and ioredis callers use.
  async set(key: string, value: string | number, ...args: (string | number)[]): Promise<'OK' | null> {
    let expires_at: number | null = null
    let nx = false
    let xx = false
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase()
      if (a === 'EX') expires_at = this.now() + Number(args[++i]) * 1000
      else if (a === 'PX') expires_at = this.now() + Number(args[++i])
      else if (a === 'NX') nx = true
      else if (a === 'XX') xx = true
      else throw new Error(`MemoryRedis: unsupported SET option ${a}`)
    }
    const exists = this.live(key) !== undefined
    if ((nx && exists) || (xx && !exists)) return null
    this.store.set(key, { value: String(value), expires_at })
    return 'OK'
  }

  async setex(key: string, seconds: number, value: string | number): Promise<'OK'> {
    this.store.set(key, { value: String(value), expires_at: this.now() + seconds * 1000 })
    return 'OK'
  }

  async del(...keys: (string | string[])[]): Promise<number> {
    let n = 0
    for (const k of keys.flat()) if (this.live(k) !== undefined && this.store.delete(k)) n++
    return n
  }

  // Keeps the key's TTL, like Redis does.
  async incr(key: string): Promise<number> {
    const e = this.live(key)
    const current = e ? Number(e.value) : 0
    if (!Number.isInteger(current)) throw new Error('ERR value is not an integer or out of range')
    const next = current + 1
    this.store.set(key, { value: String(next), expires_at: e?.expires_at ?? null })
    return next
  }

  async ping(): Promise<'PONG'> {
    return 'PONG'
  }

  async flushall(): Promise<'OK'> {
    this.store.clear()
    return 'OK'
  }

  pipeline(): MemoryPipeline {
    return new MemoryPipeline(this)
  }
}

// Runs its commands in order, like a Redis pipeline, and resolves to ioredis's [[err, result], ...].
class MemoryPipeline {
  private ops: (() => Promise<unknown>)[] = []

  constructor(private r: MemoryRedis) {}

  set(key: string, value: string | number, ...args: (string | number)[]): this {
    this.ops.push(() => this.r.set(key, value, ...args))
    return this
  }
  setex(key: string, seconds: number, value: string | number): this {
    this.ops.push(() => this.r.setex(key, seconds, value))
    return this
  }
  get(key: string): this {
    this.ops.push(() => this.r.get(key))
    return this
  }
  del(...keys: string[]): this {
    this.ops.push(() => this.r.del(...keys))
    return this
  }
  incr(key: string): this {
    this.ops.push(() => this.r.incr(key))
    return this
  }

  async exec(): Promise<Reply[]> {
    const out: Reply[] = []
    for (const op of this.ops) {
      try {
        out.push([null, await op()])
      } catch (e) {
        out.push([e as Error, undefined])
      }
    }
    return out
  }
}
