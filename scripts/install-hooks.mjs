import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (process.env.CI) process.exit(0)
if (!existsSync('.git')) process.exit(0)

const currentHooksPathRes = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { encoding: 'utf8' })
const currentHooksPath = currentHooksPathRes.status === 0 ? currentHooksPathRes.stdout.trim() : ''

if (currentHooksPath && currentHooksPath !== '.githooks') {
  console.warn(`Skipping git hooks installation: core.hooksPath is already set to "${currentHooksPath}".`)
  process.exit(0)
}

if (currentHooksPath === '.githooks') process.exit(0)

const res = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' })
if (res.status !== 0) {
  console.warn('Warning: Failed to set git core.hooksPath. Git hooks may not be installed.')
}
process.exit(0)
