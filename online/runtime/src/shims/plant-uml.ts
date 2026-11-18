import type { CodeblockTransformContext } from '@slidev/types'
import plantUml from '../../../../packages/slidev/node/syntax/codeblock/plant-uml'
import wrap from '../../../../packages/slidev/node/syntax/codeblock/wrapper'

export default async function guardedPlantUml(ctx: CodeblockTransformContext) {
  if (!/^plantuml\b/.test(ctx.info))
    return
  if ((ctx.options as any).onlinePlantUmlAllowed === true)
    return plantUml(ctx)
  return `<p class="online-notice" role="status">PlantUML is off. Enable it for this deck to send diagram text to plantuml.com.</p>\n${await wrap({ ...ctx, info: 'text' })}`
}
