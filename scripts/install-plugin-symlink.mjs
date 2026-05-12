import { existsSync, symlinkSync, unlinkSync, rmSync, lstatSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.platform === 'win32') process.exit(0) // symlinks require admin on Windows; shims not generated

// Codex plugin: plugins/pr-shepherd/skills/pr-shepherd → plugin/skills/pr-shepherd
// Must run in CI too — the Codex plugin is packaged from this repo and the symlink
// must exist so the skill is resolved when Codex loads the plugin.
const codexSkillTarget = resolve('plugin/skills/pr-shepherd')
const codexSkillPath = resolve('plugins/pr-shepherd/skills/pr-shepherd')

try {
  const stat = lstatSync(codexSkillPath)
  if (stat.isSymbolicLink()) {
    unlinkSync(codexSkillPath)
  } else if (stat.isDirectory()) {
    rmSync(codexSkillPath, { recursive: true })
  }
} catch {}

symlinkSync(codexSkillTarget, codexSkillPath)
console.log(`pr-shepherd codex skill symlink → ${codexSkillTarget}`)

// Claude Code plugin: ~/.claude/.../skills → plugin/skills
// Skip in CI — no home-directory plugin registry is set up there.
if (process.env.CI) process.exit(0)

const skillsTarget = resolve('plugin/skills')
const symlinkPath =
  `${process.env.HOME}/.claude/plugins/marketplaces/local/plugins/pr-shepherd/skills`

if (existsSync(`${process.env.HOME}/.claude/plugins/marketplaces/local/plugins/pr-shepherd`)) {
  try {
    unlinkSync(symlinkPath)
  } catch {}

  symlinkSync(skillsTarget, symlinkPath)
  console.log(`pr-shepherd plugin symlink → ${skillsTarget}`)
}
