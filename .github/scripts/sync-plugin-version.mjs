import { readFileSync, writeFileSync } from 'fs'

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const pluginPath = '.claude-plugin/plugin.json'
const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'))
plugin.version = version
writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n')
