import type { RenderInput } from './renderer'

const MAX_BYTES = 5 * 1024 * 1024
const encoder = new TextEncoder()

export type RuntimeCommand = ({ protocol: 1, type: 'render' } & RenderInput)
  | { protocol: 1, type: 'goto', slide: number, click: number }
  | { protocol: 1, type: 'next' }
  | { protocol: 1, type: 'prev' }

export function parseCommand(value: unknown): RuntimeCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid preview command')
  const data = value as Record<string, unknown>
  if (data.protocol !== 1 || !['render', 'goto', 'next', 'prev'].includes(String(data.type)))
    throw new Error('Unsupported preview protocol or command')
  const fields = data.type === 'render'
    ? [
        'protocol',
        'type',
        'src',
        'css',
        'slide',
        'click',
        'dark',
      ]
    : data.type === 'goto'
      ? ['protocol', 'type', 'slide', 'click']
      : ['protocol', 'type']
  if (Object.keys(data).some(key => !fields.includes(key)))
    throw new Error('Unknown preview command field')
  if (data.type === 'next' || data.type === 'prev')
    return data as RuntimeCommand
  if (!Number.isSafeInteger(data.slide) || (data.slide as number) < 1 || (data.slide as number) > 10000
    || !Number.isSafeInteger(data.click) || (data.click as number) < 0 || (data.click as number) > 1000000) {
    throw new Error('Invalid preview position')
  }
  if (data.type === 'render') {
    if (typeof data.src !== 'string' || typeof data.css !== 'string' || typeof data.dark !== 'boolean')
      throw new TypeError('Invalid render document')
    if (data.src.length + data.css.length > MAX_BYTES
      || encoder.encode(data.src).byteLength + encoder.encode(data.css).byteLength > MAX_BYTES) {
      throw new Error('The document exceeds the 5 MiB limit')
    }
  }
  return data as RuntimeCommand
}
