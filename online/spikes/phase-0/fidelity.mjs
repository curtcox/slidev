import process from 'node:process'
import { register } from 'tsx/esm/api'

// The root tsconfig maps @slidev/types to source with CommonJS package metadata.
// Node's characterization harness needs the built package exports instead.
register({ tsconfig: false })
import('./fidelity.mts').catch((error) => {
  console.error(error)
  process.exitCode = 1
})
