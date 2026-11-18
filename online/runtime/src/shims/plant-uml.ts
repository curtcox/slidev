import type { CodeblockTransformContext } from '@slidev/types'
import plantUml from '../../../../packages/slidev/node/syntax/codeblock/plant-uml'
import wrap from '../../../../packages/slidev/node/syntax/codeblock/wrapper'

export default async function guardedPlantUml(ctx: CodeblockTransformContext) {
  if (!/^plantuml\b/.test(ctx.info))
    return
  if ((ctx.options as any).onlinePlantUmlAllowed === true)
    return plantUml(ctx)
  const diagram = (await plantUml(ctx))!.replace('<PlantUml', '<OnlinePlantUml').replace(/\s*\/>$/, '>')
  return `${diagram}\n${await wrap({ ...ctx, info: 'text' })}\n</OnlinePlantUml>`
}
