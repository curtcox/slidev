import assert from 'node:assert/strict'
import { it } from 'node:test'
import { formatElapsed, isValidSession, parsePresenterMessage } from '../src/presenter-sync.js'

const session = '12345678-1234-4123-8123-123456789abc'

it('formats elapsed presentation time as HH:MM:SS', () => {
  assert.equal(formatElapsed(-500), '00:00:00')
  assert.equal(formatElapsed(0), '00:00:00')
  assert.equal(formatElapsed(65_400), '00:01:05')
  assert.equal(formatElapsed(3_723_999), '01:02:03')
})

it('validates presenter session identifiers and filters foreign messages', () => {
  assert.equal(isValidSession(session), true)
  assert.equal(isValidSession('short'), false)
  assert.equal(isValidSession('bad session!'), false)
  assert.equal(parsePresenterMessage({ session: 'other-session-id', type: 'next' }, session), null)
  assert.deepEqual(parsePresenterMessage({ session, type: 'hello' }, session), { session, type: 'hello' })
  assert.deepEqual(parsePresenterMessage({ session, type: 'next' }, session), { session, type: 'next' })
  assert.deepEqual(parsePresenterMessage({ session, type: 'prev' }, session), { session, type: 'prev' })
  assert.deepEqual(parsePresenterMessage({ session, type: 'dark', dark: true }, session), { session, type: 'dark', dark: true })
  assert.deepEqual(parsePresenterMessage({
    session,
    type: 'goto',
    slide: 3,
    click: 1,
  }, session), {
    session,
    type: 'goto',
    slide: 3,
    click: 1,
  })
})

it('rejects malformed or oversized presenter messages', () => {
  const validDoc = {
    session,
    type: 'document',
    docVersion: 1,
    src: '# Slide 1\n---\n# Slide 2',
    css: '',
    slide: 1,
    click: 0,
    total: 2,
    dark: false,
    run: true,
    notes: ['Note 1', ''],
    titles: ['Slide 1', 'Slide 2'],
  }
  assert.deepEqual(parsePresenterMessage(validDoc, session), validDoc)
  for (const bad of [
    null,
    [],
    { session, type: 'unknown' },
    { session, type: 'dark', dark: 'yes' },
    {
      session,
      type: 'goto',
      slide: 0,
      click: 0,
    },
    {
      session,
      type: 'goto',
      slide: 10001,
      click: 0,
    },
    {
      session,
      type: 'goto',
      slide: 1,
      click: -1,
    },
    { ...validDoc, docVersion: -1 },
    {
      ...validDoc,
      notes: [123],
    },
    { ...validDoc, titles: 'not-an-array' },
    {
      ...validDoc,
      src: 'é'.repeat(1_500_000),
      css: 'é'.repeat(1_500_000),
    },
  ]) {
    assert.equal(parsePresenterMessage(bad, session), null)
  }
})
