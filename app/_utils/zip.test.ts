import { describe, it, expect } from 'vitest'
import { build_zip, crc32, type ZipEntry } from './zip'

function extract(zip: Buffer): Record<string, Buffer> {
  const eocd = zip.length - 22
  expect(zip.readUInt32LE(eocd)).toBe(0x06054b50)
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)
  const out: Record<string, Buffer> = {}
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50)
    const size = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const localOff = zip.readUInt32LE(p + 42)
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen)

    expect(zip.readUInt32LE(localOff)).toBe(0x04034b50)
    const lNameLen = zip.readUInt16LE(localOff + 26)
    const lExtraLen = zip.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    out[name] = zip.subarray(dataStart, dataStart + size)

    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

describe('crc32', () => {
  it('matches the standard check value for "123456789"', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })
})

describe('build_zip', () => {
  it('starts with a local file header and ends with an EOCD record', () => {
    const zip = build_zip([{ name: 'a.txt', data: Buffer.from('hello') }])
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50)
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(1)
  })

  it('round-trips multiple files, names, and contents', () => {
    const entries: ZipEntry[] = [
      { name: 'transactions.csv', data: Buffer.from('id,amount\r\n1,42\r\n', 'utf8') },
      { name: 'accounts.csv', data: Buffer.from('name\r\nCafé\r\n', 'utf8') },
    ]
    const files = extract(build_zip(entries))
    expect(Object.keys(files).sort()).toEqual(['accounts.csv', 'transactions.csv'])
    expect(files['transactions.csv'].toString('utf8')).toBe('id,amount\r\n1,42\r\n')
    expect(files['accounts.csv'].toString('utf8')).toBe('name\r\nCafé\r\n')
  })

  it('keeps the central directory size/offset self-consistent', () => {
    const zip = build_zip([
      { name: 'a', data: Buffer.from('one') },
      { name: 'b', data: Buffer.from('two!!') },
    ])
    const eocd = zip.length - 22
    const centralSize = zip.readUInt32LE(eocd + 12)
    const centralOffset = zip.readUInt32LE(eocd + 16)
    expect(centralOffset + centralSize + 22).toBe(zip.length)
  })

  it('handles an empty file entry', () => {
    const files = extract(build_zip([{ name: 'empty.csv', data: Buffer.from('') }]))
    expect(files['empty.csv'].length).toBe(0)
  })
})
