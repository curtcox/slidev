import { slidevDocument } from './document-type.js'

function crc32(bytes) {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1)
        ? 0xEDB88320
        : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/** A ZIP with two fixed filenames, stored verbatim using the ZIP 2.0 format. */
export function deckZip(document) {
  const doc = slidevDocument.normalize(document)
  const encoder = new TextEncoder()
  const entries = [
    ['slides.md', doc.src],
    ['style.css', doc.slidev.css],
  ].map(([name, text]) => ({
    name: encoder.encode(name),
    data: encoder.encode(text),
  }))
  const parts = []
  const directory = []
  let offset = 0
  for (const { name, data } of entries) {
    const checksum = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const header = new DataView(local.buffer)
    header.setUint32(0, 0x04034B50, true)
    header.setUint16(4, 20, true)
    header.setUint16(12, 33, true) // 1980-01-01; no author metadata.
    header.setUint32(14, checksum, true)
    header.setUint32(18, data.length, true)
    header.setUint32(22, data.length, true)
    header.setUint16(26, name.length, true)
    local.set(name, 30)
    parts.push(local, data)

    const central = new Uint8Array(46 + name.length)
    const record = new DataView(central.buffer)
    record.setUint32(0, 0x02014B50, true)
    record.setUint16(4, 20, true)
    record.setUint16(6, 20, true)
    record.setUint16(14, 33, true)
    record.setUint32(16, checksum, true)
    record.setUint32(20, data.length, true)
    record.setUint32(24, data.length, true)
    record.setUint16(28, name.length, true)
    record.setUint32(38, 0x20, true) // DOS archive attribute.
    record.setUint32(42, offset, true)
    central.set(name, 46)
    directory.push(central)
    offset += local.length + data.length
  }
  const end = new Uint8Array(22)
  const record = new DataView(end.buffer)
  record.setUint32(0, 0x06054B50, true)
  record.setUint16(8, entries.length, true)
  record.setUint16(10, entries.length, true)
  record.setUint32(12, directory.reduce((size, entry) => size + entry.length, 0), true)
  record.setUint32(16, offset, true)
  return new Blob([
    ...parts,
    ...directory,
    end,
  ], { type: 'application/zip' })
}
