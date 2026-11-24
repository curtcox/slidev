import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget'
import 'monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution'
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching'
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard'
import 'monaco-editor/editor/contrib/comment/browser/comment'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/folding/browser/folding'
import 'monaco-editor/editor/contrib/indentation/browser/indentation'
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations'
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor'
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter'
import 'monaco-editor/languages/definitions/cpp/register'
import 'monaco-editor/languages/definitions/csharp/register'
import 'monaco-editor/languages/definitions/css/register'
import 'monaco-editor/languages/definitions/dockerfile/register'
import 'monaco-editor/languages/definitions/go/register'
import 'monaco-editor/languages/definitions/graphql/register'
import 'monaco-editor/languages/definitions/html/register'
import 'monaco-editor/languages/definitions/ini/register'
import 'monaco-editor/languages/definitions/java/register'
import 'monaco-editor/languages/definitions/javascript/register'
import 'monaco-editor/languages/definitions/kotlin/register'
import 'monaco-editor/languages/definitions/less/register'
import 'monaco-editor/languages/definitions/lua/register'
import 'monaco-editor/languages/definitions/markdown/register'
import 'monaco-editor/languages/definitions/php/register'
import 'monaco-editor/languages/definitions/powershell/register'
import 'monaco-editor/languages/definitions/python/register'
import 'monaco-editor/languages/definitions/ruby/register'
import 'monaco-editor/languages/definitions/rust/register'
import 'monaco-editor/languages/definitions/scss/register'
import 'monaco-editor/languages/definitions/shell/register'
import 'monaco-editor/languages/definitions/sql/register'
import 'monaco-editor/languages/definitions/swift/register'
import 'monaco-editor/languages/definitions/typescript/register'
import 'monaco-editor/languages/definitions/xml/register'
import 'monaco-editor/languages/definitions/yaml/register'

// Opaque sandboxes cannot resolve relative worker URLs, and ATA / CDN language
// servers are disabled online. Provide a minimal in-memory Blob worker.
const workerBlobUrl = URL.createObjectURL(new Blob(
  ['self.onmessage = () => {};'],
  { type: 'text/javascript' },
))
;(globalThis as any).MonacoEnvironment = {
  getWorker() {
    return new Worker(workerBlobUrl)
  },
}

export { monaco }
