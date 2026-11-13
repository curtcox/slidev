// Minimal virtual-module seam for the S1 probe, not the online runtime.
import { reactive } from 'vue'
import { resolveConfig } from '../../../packages/parser/src/config'

export default reactive(resolveConfig({}))
