import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (process.env.CI) process.exit(0)
if (!existsSync('.git')) process.exit(0)

const res = spawnSync('npx', ['husky'], { stdio: 'inherit' })
process.exit(res.status ?? 0)
