import { existsSync, symlinkSync, rmSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'

if (process.platform === 'win32') process.exit(0) // symlinks require admin on Windows; shims not generated

// Codex plugin: plugins/pr-shepherd/skills/pr-shepherd → plugin/skills/pr-shepherd
// Must run in CI too — the Codex plugin is packaged from this repo and the symlink
// must exist so the skill is resolved when Codex loads the plugin.
// Use a relative target so the symlink is portable across machines and checkouts.
const codexSkillPath = resolve('plugins/pr-shepherd/skills/pr-shepherd')
const codexSkillRelTarget = relative(dirname(codexSkillPath), resolve('plugin/skills/pr-shepherd'))

rmSync(codexSkillPath, { recursive: true, force: true })
symlinkSync(codexSkillRelTarget, codexSkillPath)
console.log(`pr-shepherd codex skill symlink → ${codexSkillRelTarget}`)

// Claude Code plugin: ~/.claude/.../skills → plugin/skills
// Skip in CI — no home-directory plugin registry is set up there.
if (process.env.CI) process.exit(0)

const skillsTarget = resolve('plugin/skills')
const symlinkPath =
  `${process.env.HOME}/.claude/plugins/marketplaces/local/plugins/pr-shepherd/skills`

if (existsSync(`${process.env.HOME}/.claude/plugins/marketplaces/local/plugins/pr-shepherd`)) {
  rmSync(symlinkPath, { recursive: true, force: true })
  symlinkSync(skillsTarget, symlinkPath)
  console.log(`pr-shepherd plugin symlink → ${skillsTarget}`)
}
