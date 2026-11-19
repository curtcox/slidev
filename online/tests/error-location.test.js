import assert from 'node:assert/strict'
import { it } from 'node:test'
import { readErrorLocation } from '../src/error-location.js'

it('accepts only bounded coordinates for a known editor file', () => {
  const location = { file: 'slides.md', line: 2, column: 3 }
  assert.deepEqual(readErrorLocation(location, '# Deck\r\n☕ hi', ''), location)
  assert.deepEqual(readErrorLocation({ file: 'style.css', line: 1, column: 1 }, '', ''), { file: 'style.css', line: 1, column: 1 })
  for (const value of [
    null,
    { ...location, file: 'other.js' },
    { ...location, line: 0 },
    { ...location, line: 3 },
    { ...location, line: Infinity },
    { ...location, line: '2' },
    { ...location, column: 0 },
    { ...location, column: 99 },
    { ...location, column: 1.5 },
  ]) {
    assert.equal(readErrorLocation(value, '# Deck\n☕ hi', ''), undefined)
  }
})
