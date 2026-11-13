import { reactive } from 'vue'
import { resolveConfig } from '../../../../packages/parser/src/config'

export default reactive(resolveConfig({}))
