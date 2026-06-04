// Minimal store-only (uncompressed) ZIP builder — no external dependency. Our
// exports are small, so compression isn't worth pulling in a library. Produces a
// standard PKZIP archive (one stored entry per file, 32-bit sizes — no ZIP64)
// that any unzip tool reads. Pure: takes file bytes, returns archive bytes.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = (CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}

// DOS date/time fields used by the ZIP local/central headers. Seconds have
// 2-second resolution in the format; clamp the year to the 1980 epoch floor.
function dos_date_time(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear())
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

export type ZipEntry = { name: string; data: Uint8Array }

export function build_zip(entries: ZipEntry[], now: Date = new Date()): Buffer {
  const { time, date } = dos_date_time(now)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data)
    const crc = crc32(data)

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4) // version needed to extract
    local.writeUInt16LE(0, 6) // general purpose bit flag
    local.writeUInt16LE(0, 8) // compression method: 0 = store
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18) // compressed size
    local.writeUInt32LE(data.length, 22) // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra field length
    nameBuf.copy(local, 30)
    locals.push(local, data)

    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0) // central directory header signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed to extract
    central.writeUInt16LE(0, 8) // general purpose bit flag
    central.writeUInt16LE(0, 10) // compression method
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20) // compressed size
    central.writeUInt32LE(data.length, 24) // uncompressed size
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30) // extra field length
    central.writeUInt16LE(0, 32) // file comment length
    central.writeUInt16LE(0, 34) // disk number start
    central.writeUInt16LE(0, 36) // internal file attributes
    central.writeUInt32LE(0, 38) // external file attributes
    central.writeUInt32LE(offset, 42) // relative offset of local header
    nameBuf.copy(central, 46)
    centrals.push(central)

    offset += local.length + data.length
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const centralOffset = offset

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end of central directory signature
  end.writeUInt16LE(0, 4) // number of this disk
  end.writeUInt16LE(0, 6) // disk where central directory starts
  end.writeUInt16LE(entries.length, 8) // central directory records on this disk
  end.writeUInt16LE(entries.length, 10) // total central directory records
  end.writeUInt32LE(centralSize, 12) // size of central directory
  end.writeUInt32LE(centralOffset, 16) // offset of start of central directory
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...locals, ...centrals, end])
}
