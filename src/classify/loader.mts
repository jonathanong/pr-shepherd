import { readdirSync, statSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import type { ClassifyRule } from "./types.mts";

export interface LoadedRule {
  name: string;
  file: string;
  rule: ClassifyRule;
}

const CLASSIFICATION_DIR = ".pr-shepherd/classification";
const VALID_EXTENSIONS = new Set([".ts", ".mts", ".mjs", ".js"]);

export function discoverRuleFiles(cwd: string): string[] {
  const home = homedir();
  let current = cwd;
  while (true) {
    const candidate = join(current, CLASSIFICATION_DIR);
    if (statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) {
      return collectRuleFiles(candidate);
    }
    if (current === home || current === dirname(current)) return [];
    current = dirname(current);
  }
}

function collectRuleFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => !name.startsWith("_") && !name.startsWith("."))
    .filter((name) => VALID_EXTENSIONS.has(extname(name)))
    .map((name) => join(dir, name))
    .sort();
}

let tsxRegistered = false;

async function ensureTsxRegistered(): Promise<void> {
  if (tsxRegistered) return;
  const { register } = await import("tsx/esm/api");
  register();
  tsxRegistered = true;
}

const ruleCache = new Map<string, LoadedRule[]>();

export async function loadRules(files: string[]): Promise<LoadedRule[]> {
  if (files.length === 0) return [];
  const cacheKey = [...files].sort((a, b) => a.localeCompare(b)).join("\0");
  const cached = ruleCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const hasTs = files.some((f) => f.endsWith(".ts") || f.endsWith(".mts"));
  if (hasTs) await ensureTsxRegistered();
  const rules: LoadedRule[] = [];
  for (const file of files) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
      if (typeof mod.default !== "function") {
        process.stderr.write(
          `pr-shepherd: classification rule ${file}: default export is not a function — skipped\n`,
        );
        continue;
      }
      const name = basename(file).replace(/\.[^.]+$/, "");
      rules.push({ name, file, rule: mod.default as ClassifyRule });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `pr-shepherd: classification rule ${file}: failed to load: ${msg} — skipped\n`,
      );
    }
  }
  ruleCache.set(cacheKey, rules);
  return rules;
}

/** Reset the rule cache — for use in tests. */
export function _resetRuleCache(): void {
  ruleCache.clear();
}
