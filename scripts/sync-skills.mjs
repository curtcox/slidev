import { execSync } from 'node:child_process'
import process from 'node:process'

// Agent skills are developer tooling; remote skill changes must not block CI.
if (!process.env.CI)
  execSync('skills experimental_sync -y -r', { stdio: 'inherit' })
