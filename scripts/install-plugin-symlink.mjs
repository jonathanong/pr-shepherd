import { existsSync, symlinkSync, unlinkSync, rmSync, lstatSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.env.CI) process.exit(0)
if (process.platform === 'win32') process.exit(0) // symlinks require admin on Windows; shims not generated

// Claude Code plugin: ~/.claude/.../skills → plugin/skills
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

// Codex plugin: plugins/pr-shepherd/skills/pr-shepherd → plugin/skills/pr-shepherd
// This makes the Codex skill a symlink to the canonical Claude Code plugin skill.
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
