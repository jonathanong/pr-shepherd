import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const pluginPaths = [
  '.claude-plugin/plugin.json',
  'plugins/pr-shepherd/.codex-plugin/plugin.json',
]

for (const pluginPath of pluginPaths) {
  const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'))
  plugin.version = version
  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n')
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
execFileSync(npx, ['oxfmt', ...pluginPaths], { stdio: 'inherit' })
