import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { parse } from 'yaml'
import builtins from '../config.json' with { type: 'json' }

export interface PrShepherdConfig {
  cache: {
    ttlSeconds: number
  }
  iterate: {
    cooldownSeconds: number
    maxFixAttempts: number
  }
  watch: {
    intervalDefault: string
    readyDelayMinutesDefault: number
    expiresHoursDefault: number
    maxTurns: number
  }
  resolve: {
    concurrency: number
    shaPollIntervalMs: number
    shaPollMaxAttempts: number
  }
  checks: {
    relevantEvents: string[]
    timeoutPatterns: string[]
    infraPatterns: string[]
    logLinesKept: number
    logExcerptMaxChars: number
  }
  baseBranch: string | null
  minimizeBots: boolean
  cancelCiOnFailure: boolean
}

const RC_FILENAME = '.pr-shepherdrc.yml'

function findRcFile(startDir: string): string | null {
  const home = homedir()
  let current = startDir
  while (true) {
    const candidate = join(current, RC_FILENAME)
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      // not found here
    }
    if (current === home || current === dirname(current)) return null
    current = dirname(current)
  }
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override)) {
    const overVal = override[key]
    const baseVal = base[key]
    if (
      overVal !== null &&
      typeof overVal === 'object' &&
      !Array.isArray(overVal) &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      )
    } else if (overVal !== undefined) {
      result[key] = overVal
    }
  }
  return result
}

const defaults: PrShepherdConfig = {
  ...builtins,
  baseBranch: null,
  minimizeBots: true,
  cancelCiOnFailure: true,
}

let cached: PrShepherdConfig | null = null

export function loadConfig(): PrShepherdConfig {
  if (cached) return cached

  const rcPath = findRcFile(process.cwd())
  if (!rcPath) {
    cached = defaults
    return cached
  }

  try {
    const raw = readFileSync(rcPath, 'utf8')
    const parsed = (parse(raw) ?? {}) as Record<string, unknown>
    cached = deepMerge(
      defaults as unknown as Record<string, unknown>,
      parsed,
    ) as unknown as PrShepherdConfig
    return cached
  } catch (err) {
    process.stderr.write(
      `pr-shepherd: failed to parse ${rcPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    cached = { ...defaults }
    return cached
  }
}
