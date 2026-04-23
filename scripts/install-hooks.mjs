import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (process.env.CI) process.exit(0)
if (!existsSync('.git')) process.exit(0)

const res = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' })
if (res.status !== 0) {
  console.warn('Warning: Failed to set git core.hooksPath. Git hooks may not be installed.')
}
process.exit(0)
