import assert from 'node:assert/strict'
import { it } from 'node:test'
// eslint-disable-next-line antfu/no-import-dist
import { parseCommand } from '../runtime/dist/sandbox.js'

it('bounds and validates the document and position before runtime execution', () => {
  const render = {
    protocol: 1,
    type: 'render',
    src: '# Deck',
    css: '',
    slide: 1,
    click: 0,
    dark: false,
  }
  assert.deepEqual(parseCommand(render), render)
  assert.deepEqual(parseCommand({
    protocol: 1,
    type: 'goto',
    slide: 2,
    click: 3,
  }), {
    protocol: 1,
    type: 'goto',
    slide: 2,
    click: 3,
  })
  assert.deepEqual(parseCommand({ protocol: 1, type: 'next' }), { protocol: 1, type: 'next' })
  assert.deepEqual(parseCommand({ protocol: 1, type: 'prev' }), { protocol: 1, type: 'prev' })
  for (const value of [
    null,
    [],
    { ...render, protocol: 2 },
    { ...render, type: 'print' },
    { protocol: 1, type: 'next', slide: 1 },
    { protocol: 1, type: 'prev', extra: true },
    { ...render, slide: 0 },
    { ...render, slide: 1.5 },
    { ...render, slide: 10001 },
    { ...render, click: -1 },
    { ...render, click: Infinity },
    { ...render, dark: 'false' },
    { ...render, extra: true },
    { ...render, src: 1 },
    { ...render, css: null },
  ]) {
    assert.throws(() => parseCommand(value))
  }
  assert.throws(() => parseCommand({
    ...render,
    src: 'é'.repeat(1500000),
    css: 'é'.repeat(1500000),
  }), /5 MiB/)
})
