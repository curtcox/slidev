import type { CodeblockTransformContext } from '@slidev/types'
import wrap from '../../../../packages/slidev/node/syntax/codeblock/wrapper'

export default async function monaco(ctx: CodeblockTransformContext) {
  if (!/\{monaco(?:-run)?\b/.test(ctx.info))
    return
  return `<p class="online-notice" role="status">Monaco editing and execution are not available yet; this is a static code block.</p>\n${await wrap({
    ...ctx,
    info: ctx.info.replace(/\{monaco[^}]*\}/g, ''),
  })}`
}
