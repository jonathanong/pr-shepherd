import { cpSync, chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// 1. rm -rf bin
rmSync('bin', { recursive: true, force: true })

// 2. tsc -p tsconfig.build.json
const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' })
if (tsc.status !== 0) process.exit(tsc.status ?? 1)

// 3. Copy src/config.json -> bin/config.json
cpSync('src/config.json', 'bin/config.json')

// 4. Copy src/github/gql/ -> bin/github/gql/
mkdirSync('bin/github', { recursive: true })
cpSync('src/github/gql', 'bin/github/gql', { recursive: true })

// 5. Write bin/pr-shepherd entry point
writeFileSync('bin/pr-shepherd', '#!/usr/bin/env node\nimport("./index.mjs")\n')

// 6. Set executable bit
chmodSync('bin/pr-shepherd', 0o755)
