import process from 'node:process'
import { register } from 'tsx/esm/api'

register({ tsconfig: false })
import('./corpus.mts').catch((error) => {
  console.error(error)
  process.exitCode = 1
})
