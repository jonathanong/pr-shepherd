import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (process.env.CI) process.exit(0)
if (!existsSync('.git')) process.exit(0)

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const res = spawnSync(npxCmd, ['husky'], { stdio: 'inherit' })
process.exit(res.error || res.status === null ? 1 : (res.status ?? 1))
