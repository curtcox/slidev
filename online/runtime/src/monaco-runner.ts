import type { Ref } from 'vue'
import { transform } from 'sucrase'
import { ref } from 'vue'
import configs from './virtual/configs'

export interface RunnerOutputItem {
  text: string
  class?: string
}

export type RunnerOutput = RunnerOutputItem[] | { error: string }

function formatValue(arg: unknown, seen = new WeakSet<object>()): string {
  if (arg instanceof Error)
    return `Error: ${JSON.stringify(arg.message)}`
  if (arg === null || arg === undefined || typeof arg === 'symbol')
    return String(arg)
  if (typeof arg === 'string')
    return JSON.stringify(arg)
  if (typeof arg !== 'object')
    return String(arg)
  if (seen.has(arg))
    return '[Circular]'
  seen.add(arg)
  if (Array.isArray(arg))
    return `[${arg.map(item => formatValue(item, seen)).join(', ')}]`
  if (arg instanceof Set)
    return `Set (${arg.size}) {${[...arg].map(item => formatValue(item, seen)).join(', ')}}`
  if (arg instanceof Map) {
    return `Map (${arg.size}) {${[
      ...arg.entries(),
    ].map(([k, v]) => `${formatValue(k, seen)} => ${formatValue(v, seen)}`).join(', ')}}`
  }
  if (arg instanceof RegExp)
    return arg.toString()
  try {
    const name = (arg as any).constructor?.name ?? ''
    const prefix = name && name !== 'Object'
      ? `${name}: `
      : ''
    return prefix + JSON.stringify(arg, (_, value) => (value === undefined
      ? '__undefined__'
      : value), 2)
      .replace(/"__undefined__"/g, 'undefined')
  }
  catch {
    return String(arg)
  }
}

function formatArg(arg: unknown): RunnerOutputItem {
  if (typeof arg === 'string')
    return { text: arg }
  return {
    text: formatValue(arg),
  }
}

const SUPPORTED_LANGS = new Set(['js', 'javascript', 'ts', 'typescript'])

export async function runMonacoCode(code: string, lang: string, outputs: Ref<RunnerOutput[] | null> = ref<RunnerOutput[] | null>([])): Promise<Ref<RunnerOutput[] | null>> {
  if (globalThis.origin !== 'null')
    throw new Error('monaco-run must execute in an opaque sandbox')
  const normalized = lang.toLowerCase()
  const entries: RunnerOutput[] = []
  outputs.value = entries
  if (!SUPPORTED_LANGS.has(normalized)) {
    entries.push({ error: `Runner for language "${lang}" is not available online` })
    outputs.value = [...entries]
    return outputs
  }

  const onError = (error: unknown) => {
    entries.push({
      error: String(error),
    })
    outputs.value = [...entries]
  }
  const log = (...args: unknown[]) => {
    entries.push(args.map(formatArg))
    outputs.value = [...entries]
  }
  const vmConsole = {
    ...console,
    log,
    info: log,
    debug: log,
    warn: log,
    error: log,
    clear: () => {
      entries.length = 0
      outputs.value = []
    },
  }

  let jsCode: string
  try {
    jsCode = normalized === 'ts' || normalized === 'typescript'
      ? transform(code, {
        transforms: ['typescript'],
        disableESTransforms: true,
        production: true,
        filePath: 'monaco-run.ts',
      }).code
      : code
  }
  catch (error) {
    onError(error)
    return outputs
  }

  if (/^\s*import\s+/m.test(jsCode)) {
    onError(new Error('Module imports inside monaco-run are not available online'))
    return outputs
  }

  const wrapped = `export async function __slidev_run(console, __slidev_on_error) {\n${configs.monacoRunUseStrict ? '"use strict";\n' : ''}try {\n${jsCode}\n} catch (e) {\n__slidev_on_error(e);\n}\n}\n`
  const url = URL.createObjectURL(new Blob([wrapped], { type: 'text/javascript' }))
  try {
    const mod = await import(/* @vite-ignore */ url)
    await mod.__slidev_run(vmConsole, onError)
  }
  catch (error) {
    onError(error)
  }
  finally {
    URL.revokeObjectURL(url)
  }
  return outputs
}
