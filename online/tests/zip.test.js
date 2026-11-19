import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { it } from 'node:test'
import { deckZip } from '../src/zip.js'

it('matches an archive written independently with Python zipfile, including UTF-8 and CRLF', async () => {
  // zipfile.ZipInfo: default timestamp, create_system=0, external_attr=0x20;
  // ZipFile.writestr with UTF-8 bytes and ZIP_STORED for each file below.
  const reference = Buffer.from('UEsDBBQAAAAAAAAAIQA6mwDLHQAAAB0AAAAJAAAAc2xpZGVzLm1kIyBDYWbDqSDimJUNCgo8IS0tIE5vdGVzIC0tPgpQSwMEFAAAAAAAAAAhAFvNwSYeAAAAHgAAAAkAAABzdHlsZS5jc3NoMTo6YWZ0ZXIgeyBjb250ZW50OiAi4pyoIjsgfQpQSwECFAAUAAAAAAAAACEAOpsAyx0AAAAdAAAACQAAAAAAAAAAACAAAAAAAAAAc2xpZGVzLm1kUEsBAhQAFAAAAAAAAAAhAFvNwSYeAAAAHgAAAAkAAAAAAAAAAAAgAAAARAAAAHN0eWxlLmNzc1BLBQYAAAAAAgACAG4AAACJAAAAAAA=', 'base64')
  const archive = deckZip({
    src: '# Café ☕\r\n\n<!-- Notes -->\n',
    slidev: { css: 'h1::after { content: "✨"; }\n' },
  })
  assert.equal(archive.type, 'application/zip')
  assert.deepEqual(Buffer.from(await archive.arrayBuffer()), reference)
})

it('keeps empty files and enforces the document byte limit before exporting', async () => {
  const archive = deckZip({ src: '' })
  assert.equal(archive.size, 210)
  assert.throws(() => deckZip({
    src: '☕'.repeat(2 * 1024 * 1024),
  }), /5 MiB/)
  assert.throws(() => deckZip({
    src: '# Deck',
    slidev: { css: false },
  }), /CSS text/)
})
