import { describe, it, expect } from 'vitest'
import { MemoryRedis } from './memory_redis'

function make() {
  let t = 1_000_000
  const r = new MemoryRedis(() => t, 0)
  return { r, advance: (s: number) => (t += s * 1000) }
}

describe('MemoryRedis', () => {
  it('gets, sets and deletes', async () => {
    const { r } = make()
    expect(await r.get('a')).toBeNull()
    await r.set('a', '1')
    expect(await r.get('a')).toBe('1')
    expect(await r.del('a', 'missing')).toBe(1)
    expect(await r.get('a')).toBeNull()
  })

  it('expires keys written with setex and SET EX', async () => {
    const { r, advance } = make()
    await r.setex('a', 10, 'x')
    await r.set('b', 'y', 'EX', 5)
    advance(4)
    expect(await r.get('a')).toBe('x')
    expect(await r.get('b')).toBe('y')
    advance(2)
    expect(await r.get('b')).toBeNull()
    expect(await r.get('a')).toBe('x')
    advance(5)
    expect(await r.get('a')).toBeNull()
  })

  it('SET NX only writes when the key is absent, and an expired key counts as absent', async () => {
    const { r, advance } = make()
    expect(await r.set('k', '0', 'EX', 10, 'NX')).toBe('OK')
    expect(await r.set('k', '9', 'EX', 10, 'NX')).toBeNull()
    expect(await r.get('k')).toBe('0')
    advance(11)
    expect(await r.set('k', '5', 'EX', 10, 'NX')).toBe('OK')
    expect(await r.get('k')).toBe('5')
  })

  it('incr counts from zero, keeps the TTL, and rejects non-integers', async () => {
    const { r, advance } = make()
    expect(await r.incr('n')).toBe(1)
    expect(await r.incr('n')).toBe(2)
    await r.set('w', '0', 'EX', 10)
    await r.incr('w')
    advance(11)
    expect(await r.get('w')).toBeNull()
    await r.set('s', 'abc')
    await expect(r.incr('s')).rejects.toThrow('not an integer')
  })

  it('mget returns null for missing keys, in order, with spread or array args', async () => {
    const { r } = make()
    await r.set('a', '1')
    await r.set('c', '3')
    expect(await r.mget('a', 'b', 'c')).toEqual(['1', null, '3'])
    expect(await r.mget(['a', 'b'])).toEqual(['1', null])
  })

  it('pipeline matches the rate limiter usage: SET NX then INCR in one round trip', async () => {
    const { r } = make()
    const first = await r.pipeline().set('rl:x', '0', 'EX', 60, 'NX').incr('rl:x').exec()
    expect(Number(first[1][1])).toBe(1)
    const second = await r.pipeline().set('rl:x', '0', 'EX', 60, 'NX').incr('rl:x').exec()
    expect(second[0][1]).toBeNull()
    expect(Number(second[1][1])).toBe(2)
  })

  it('pipeline reports a failing command without stopping the rest', async () => {
    const { r } = make()
    await r.set('s', 'abc')
    const res = await r.pipeline().incr('s').setex('ok', 5, 'v').exec()
    expect(res[0][0]).toBeInstanceOf(Error)
    expect(res[1]).toEqual([null, 'OK'])
  })

  it('ping and flushall', async () => {
    const { r } = make()
    await r.set('a', '1')
    expect(await r.ping()).toBe('PONG')
    await r.flushall()
    expect(await r.get('a')).toBeNull()
  })

  it('sweep drops expired keys that were never read', async () => {
    const { r, advance } = make()
    await r.setex('old', 1, 'x')
    advance(2)
    r.sweep()
    expect(await r.get('old')).toBeNull()
  })
})
