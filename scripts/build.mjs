import {
  cpSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
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

// 5. Ensure the compiled CLI entry point is directly executable
const entrypoint = 'bin/index.mjs'
const entrypointSource = readFileSync(entrypoint, 'utf8')
if (!entrypointSource.startsWith('#!')) {
  writeFileSync(entrypoint, `#!/usr/bin/env node\n${entrypointSource}`)
}
chmodSync('bin/index.mjs', 0o755)

// 6. Self-link into node_modules/.bin so `npx pr-shepherd` resolves to this build
try { unlinkSync('node_modules/.bin/pr-shepherd') } catch {}
mkdirSync('node_modules/.bin', { recursive: true })
symlinkSync('../../bin/index.mjs', 'node_modules/.bin/pr-shepherd')
