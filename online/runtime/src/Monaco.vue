<script lang="ts">
</script>

<script setup lang="ts">
import type { RawAtValue } from '@slidev/types'
import type { RunnerOutput } from './monaco-runner'
import { debounce } from '@antfu/utils'
import lz from 'lz-string'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch, watchSyncEffect } from 'vue'
import { useSlideContext } from '../../../packages/client/context'
import { runMonacoCode } from './monaco-runner'
import { useNav } from './navigation'
import { isDark } from './shims/dark'
import configs from './virtual/configs'

const props = withDefaults(
  defineProps<{
    codeLz?: string
    diffLz?: string
    lang?: string
    readonly?: boolean
    lines?: boolean
    lineNumbers?: 'on' | 'off' | 'relative' | 'interval'
    height?: number | string
    editorOptions?: Record<string, unknown>
    ata?: boolean
    runnable?: boolean
    writable?: string
    autorun?: boolean | 'once'
    showOutputAt?: RawAtValue
    outputHeight?: string
    highlightOutput?: boolean
    runnerOptions?: Record<string, unknown>
  }>(),
  {
    codeLz: '',
    lang: 'typescript',
    readonly: false,
    lines: undefined,
    height: 'initial',
    ata: false,
    runnable: false,
    autorun: true,
    highlightOutput: true,
  },
)
let monacoPromise: Promise<typeof import('./monaco-entry')> | undefined
let cssPromise: Promise<void> | undefined

function loadMonacoCss() {
  if (document.querySelector('#online-monaco-css'))
    return Promise.resolve()
  cssPromise ??= (async () => {
    const response = await fetch('runtime/monaco/monaco.css', {
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok)
      throw new Error('Monaco styles are unavailable')
    const css = await response.text()
    const style = document.createElement('style')
    style.id = 'online-monaco-css'
    style.textContent = css
    document.head.append(style)
  })().catch((error) => {
    cssPromise = undefined
    throw error
  })
  return cssPromise
}

function loadMonaco() {
  monacoPromise ??= Promise.all([
    loadMonacoCss(),
    hashbinSandbox.import('runtime/monaco/monaco.js'),
  ]).then(([, mod]) => mod).catch((error) => {
    monacoPromise = undefined
    throw error
  })
  return monacoPromise
}

const langMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  md: 'markdown',
  vue: 'html',
}
const rawLang = computed(() => props.lang || 'typescript')
const normalizedLang = computed(() => langMap[rawLang.value] ?? rawLang.value)

const code = ref(lz.decompressFromBase64(props.codeLz || '').trimEnd())
const diff = props.diffLz
  ? ref(lz.decompressFromBase64(props.diffLz).trimEnd())
  : undefined

const { isPrintMode } = useNav()
const { $clicksContext } = useSlideContext()

const container = ref<HTMLDivElement>()
const loadError = ref<string | null>(null)
const loading = ref(!isPrintMode.value)
const contentHeight = ref(0)
const initialHeight = ref<number>()
const height = computed(() => {
  if (props.height === 'auto')
    return `${Math.max(60, contentHeight.value)}px`
  if (props.height === 'initial') {
    return initialHeight.value
      ? `${Math.max(60, initialHeight.value)}px`
      : '120px'
  }
  return typeof props.height === 'number'
    ? `${props.height}px`
    : props.height
})

// Runner state for {monaco-run}
const outputs = shallowRef<RunnerOutput[] | null>(null)
const runCount = ref(0)
const isRunning = ref(false)
const outputHidden = ref(Boolean(props.showOutputAt))

let clickId: string | undefined
if (props.runnable && props.showOutputAt && $clicksContext) {
  clickId = `monaco-out-${Math.random().toString(36).slice(2, 10)}`
  onMounted(() => {
    const info = $clicksContext.calculate(props.showOutputAt)
    if (info) {
      $clicksContext.register(clickId!, info)
      watchSyncEffect(() => {
        outputHidden.value = !info.isActive.value
      })
    }
    else {
      outputHidden.value = false
    }
  })
  onUnmounted(() => {
    if (clickId)
      $clicksContext.unregister(clickId)
  })
}

async function runCode() {
  if (!props.runnable)
    return
  isRunning.value = true
  try {
    await runMonacoCode(code.value, normalizedLang.value, outputs)
    runCount.value += 1
  }
  finally {
    isRunning.value = false
  }
}

const triggerRun = debounce(200, () => {
  void runCode()
})

if (props.runnable) {
  const mode = isPrintMode.value ? 'once' : props.autorun
  if (mode === 'once') {
    onMounted(() => {
      void runCode()
    })
  }
  else if (mode) {
    onMounted(() => {
      watch(code, () => triggerRun(), { immediate: true })
    })
  }
}

const disposables: Array<() => void> = []

onMounted(async () => {
  if (isPrintMode.value || !container.value)
    return
  try {
    const { monaco } = await loadMonaco()
    if (!container.value)
      return

    const activeLang = normalizedLang.value
    const stopTheme = watch(isDark, (dark) => {
      monaco.editor.setTheme(dark ? 'vs-dark' : 'vs')
    }, { immediate: true })
    disposables.push(stopTheme)

    const lineNumbers = props.lineNumbers ?? ((props.lines ?? configs.lineNumbers)
      ? 'on'
      : 'off')
    const commonOptions: Record<string, unknown> = {
      automaticLayout: true,
      readOnly: props.readonly,
      lineNumbers,
      minimap: { enabled: false },
      overviewRulerBorder: false,
      overviewRulerLanes: 0,
      padding: { top: 10, bottom: 10 },
      lineNumbersMinChars: 3,
      bracketPairColorization: { enabled: false },
      tabSize: 2,
      fontSize: 12,
      fontFamily: 'var(--slidev-code-font-family, monospace)',
      scrollBeyondLastLine: false,
      ...props.editorOptions,
    }

    const uid = Math.random().toString(36).slice(2, 10)
    const model = monaco.editor.createModel(code.value, activeLang, monaco.Uri.parse(`file:///${uid}.${activeLang}`))
    disposables.push(() => model.dispose())
    const sub = model.onDidChangeContent(() => {
      code.value = model.getValue()
    })
    disposables.push(() => sub.dispose())

    if (diff) {
      const diffModel = monaco.editor.createModel(diff.value, activeLang, monaco.Uri.parse(`file:///${uid}-diff.${activeLang}`))
      disposables.push(() => diffModel.dispose())
      const diffSub = diffModel.onDidChangeContent(() => {
        code.value = diffModel.getValue()
      })
      disposables.push(() => diffSub.dispose())
      const editor = monaco.editor.createDiffEditor(container.value, {
        renderOverviewRuler: false,
        ...commonOptions,
      })
      disposables.push(() => editor.dispose())
      editor.setModel({ original: model, modified: diffModel })
      const originalEditor = editor.getOriginalEditor()
      const modifiedEditor = editor.getModifiedEditor()
      const updateHeight = () => {
        const nextH = Math.max(originalEditor.getContentHeight(), modifiedEditor.getContentHeight()) + 8
        initialHeight.value ??= nextH
        contentHeight.value = nextH
        void nextTick(() => editor.layout())
      }
      const origSizeSub = originalEditor.onDidContentSizeChange(updateHeight)
      const modSizeSub = modifiedEditor.onDidContentSizeChange(updateHeight)
      disposables.push(
        () => origSizeSub.dispose(),
        () => modSizeSub.dispose(),
      )
      updateHeight()
    }
    else {
      const editor = monaco.editor.create(container.value, {
        model,
        lineDecorationsWidth: 0,
        ...commonOptions,
      })
      disposables.push(() => editor.dispose())
      const sizeSub = editor.onDidContentSizeChange((e) => {
        const nextH = e.contentHeight + 8
        initialHeight.value ??= nextH
        contentHeight.value = nextH
        void nextTick(() => editor.layout())
      })
      disposables.push(() => sizeSub.dispose())
      const nextH = editor.getContentHeight() + 8
      initialHeight.value ??= nextH
      contentHeight.value = nextH
    }
    loading.value = false
  }
  catch (error) {
    loading.value = false
    loadError.value = String(error instanceof Error
      ? error.message
      : error)
  }
})

onUnmounted(() => {
  while (disposables.length)
    disposables.pop()?.()
})
</script>

<template>
  <div class="relative slidev-monaco-container">
    <template v-if="isPrintMode || loadError">
      <p v-if="loadError" class="online-notice" role="status">
        Monaco editor could not load ({{ loadError }}); showing static code.
      </p>
      <pre class="slidev-code"><code>{{ code }}</code></pre>
    </template>
    <div v-else class="relative slidev-monaco-container-inner" :style="{ height }">
      <div ref="container" class="online-monaco-host" />
      <p v-if="loading" class="online-monaco-loading" role="status">
        Loading Monaco editor…
      </p>
    </div>
    <div
      v-if="props.runnable"
      v-show="!outputHidden"
      class="online-monaco-runner"
      :style="props.outputHeight ? { height: props.outputHeight } : undefined"
    >
      <div class="online-monaco-runner-bar">
        <button
          type="button"
          class="online-monaco-run-btn"
          aria-label="Run code"
          :disabled="isRunning"
          @click="runCode"
        >
          ▶ Run
        </button>
      </div>
      <div v-if="isRunning" class="online-monaco-runner-status">
        Running…
      </div>
      <div v-else-if="!outputs" class="online-monaco-runner-status">
        Click Run to execute this code inside the slide sandbox.
      </div>
      <div v-else :key="`run-${runCount}`" class="slidev-runner-output">
        <template v-for="(entry, idx) in outputs" :key="idx">
          <div v-if="'error' in entry" class="online-monaco-error">
            {{ entry.error }}
          </div>
          <div v-else class="output-line">
            <template v-for="(item, itemIdx) in entry" :key="itemIdx">
              <span>{{ item.text }}</span>
              <span v-if="itemIdx < entry.length - 1" class="separator">, </span>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style>
.slidev-monaco-container {
  position: relative;
  margin: var(--slidev-code-margin, 0.5rem 0);
  line-height: var(--slidev-code-line-height, 1.4);
  border-radius: var(--slidev-code-radius, 6px);
  background: var(--slidev-code-background, #f8f8f8);
  border: 1px solid rgba(128, 128, 128, 0.25);
  overflow: hidden;
}
.slidev-monaco-container-inner {
  position: relative;
  width: 100%;
  min-height: 60px;
}
.online-monaco-host {
  position: absolute;
  inset: 0;
}
.online-monaco-loading {
  margin: 0;
  padding: 12px;
  font-size: 13px;
  opacity: 0.7;
}
.online-monaco-runner {
  position: relative;
  border-top: 1px solid rgba(128, 128, 128, 0.25);
  padding: 8px 12px;
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 12px;
}
.online-monaco-runner-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}
.online-monaco-run-btn {
  cursor: pointer;
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  background: transparent;
  color: inherit;
}
.online-monaco-runner-status {
  opacity: 0.65;
}
.online-monaco-error {
  color: #dc2626;
  white-space: pre-wrap;
}
.slidev-runner-output .output-line {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
