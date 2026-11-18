import process from 'node:process'
import { register } from 'tsx/esm/api'

register({ tsconfig: false })
import('./characterize.mts').catch((error) => {
  console.error(error)
  process.exitCode = 1
})
