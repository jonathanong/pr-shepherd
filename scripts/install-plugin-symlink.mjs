import { existsSync, symlinkSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.env.CI) process.exit(0)
if (process.platform === 'win32') process.exit(0) // symlinks require admin on Windows; shims not generated

const skillsTarget = resolve('plugin/skills')
const symlinkPath =
  `${process.env.HOME}/.claude/plugins/marketplaces/local/plugins/pr-shepherd/skills`

if (!existsSync(`${process.env.HOME}/.claude/plugins/marketplaces/local/plugins/pr-shepherd`)) {
  process.exit(0)
}

try {
  unlinkSync(symlinkPath)
} catch {}

symlinkSync(skillsTarget, symlinkPath)
console.log(`pr-shepherd plugin symlink → ${skillsTarget}`)
