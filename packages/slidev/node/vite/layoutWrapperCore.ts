import { templateImportContextUtils, templateInitContext, templateInjectionMarker } from './common'

const RE_SCRIPT_SETUP_TAG = /^<script setup.*>/m

/** Pure SFC wrapping shared by the Vite plugin and browser-based compilers. */
export function wrapSlideLayout(code: string, index: number, layoutImport: string) {
  const setupTag = code.match(RE_SCRIPT_SETUP_TAG)
  if (!setupTag)
    throw new Error(`[Slidev] Internal error: <script setup> block not found in slide ${index + 1}.`)

  const templatePart = code.slice(0, setupTag.index!)
  const scriptPart = code.slice(setupTag.index!)
  const bodyStart = templatePart.indexOf('<template>') + 10
  const bodyEnd = templatePart.lastIndexOf('</template>')
  let body = code.slice(bodyStart, bodyEnd).trim()
  if (body.startsWith('<div>') && body.endsWith('</div>'))
    body = body.slice(5, -6)

  return [
    templatePart.slice(0, bodyStart),
    `<InjectedLayout v-bind="_frontmatterToProps($frontmatter,${index})">\n${body}\n</InjectedLayout>`,
    templatePart.slice(bodyEnd),
    scriptPart.slice(0, setupTag[0].length),
    `import InjectedLayout from "${layoutImport}"`,
    templateImportContextUtils,
    templateInitContext,
    '$clicksContext.setup()',
    templateInjectionMarker,
    scriptPart.slice(setupTag[0].length),
  ].join('\n')
}
