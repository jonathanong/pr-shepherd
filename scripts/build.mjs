import { cpSync, chmodSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// 1. rm -rf bin
rmSync('bin', { recursive: true, force: true })

// 2. tsc -p tsconfig.build.json
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const tsc = spawnSync(npxCmd, ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' })
if (tsc.status !== 0) process.exit(tsc.status ?? 1)

// 3. Copy src/config.json -> bin/config.json
mkdirSync('bin', { recursive: true })
cpSync('src/config.json', 'bin/config.json')

// 4. Copy src/github/gql/ -> bin/github/gql/
mkdirSync('bin/github', { recursive: true })
cpSync('src/github/gql', 'bin/github/gql', { recursive: true })

// 5. Write bin/pr-shepherd entry point
writeFileSync('bin/pr-shepherd', '#!/usr/bin/env node\nimport("./index.mjs")\n')

// 6. Set executable bit
chmodSync('bin/pr-shepherd', 0o755)

// 7. Self-link into node_modules/.bin so `npx pr-shepherd` resolves to this build
try { unlinkSync('node_modules/.bin/pr-shepherd') } catch {}
mkdirSync('node_modules/.bin', { recursive: true })
symlinkSync('../../bin/pr-shepherd', 'node_modules/.bin/pr-shepherd')

// 8. Write bin/pr-shepherd-mcp entry point
writeFileSync('bin/pr-shepherd-mcp', '#!/usr/bin/env node\nimport("./mcp-index.mjs")\n')

// 9. Set executable bit
chmodSync('bin/pr-shepherd-mcp', 0o755)

// 10. Self-link into node_modules/.bin so `npx pr-shepherd-mcp` resolves to this build
try { unlinkSync('node_modules/.bin/pr-shepherd-mcp') } catch {}
symlinkSync('../../bin/pr-shepherd-mcp', 'node_modules/.bin/pr-shepherd-mcp')
