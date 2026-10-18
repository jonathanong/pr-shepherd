import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { isScalar, parse, parseDocument } from "yaml";
import { getEffectiveCwd } from "../execution-context.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { configError, issueLines, resolveConfig, type PrShepherdConfig } from "./resolve.mts";
import { CONFIG_VERSION, configFileSchema } from "./schema.mts";

export type {
  GraphqlQuotaWarningBand,
  InstructionStyle,
  MinimizeCommentsPolicy,
  PrShepherdConfig,
  ResolveOtherHumanThreads,
} from "./resolve.mts";

/** Accepted config file names, checked in every directory from cwd up to `$HOME`. */
const CONFIG_FILE_NAMES = [
  ".pr-shepherdrc.yml",
  ".pr-shepherdrc.yaml",
  join(".pr-shepherd", "config.yml"),
  join(".pr-shepherd", "config.yaml"),
];

function configFileIn(dir: string): string | undefined {
  const found = CONFIG_FILE_NAMES.map((name) => join(dir, name)).filter(
    (candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile() === true,
  );
  if (found.length > 1) {
    throw new ShepherdError(
      `multiple config files in ${dir}: ${found.join(", ")}. Keep exactly one.`,
      EXIT.CONFIG,
    );
  }
  return found[0];
}

/**
 * Collect config files from `startDir` toward `$HOME` (closest first). The `$HOME` file is
 * always included when it exists, even if cwd is outside the home directory. The walk never
 * includes the filesystem root, so a root-level file cannot override the user-level file.
 */
function collectConfigFiles(startDir: string): string[] {
  const home = resolve(homedir());
  const files: string[] = [];
  const visited = new Set<string>();
  const add = (dir: string): void => {
    if (visited.has(dir)) return;
    visited.add(dir);
    const file = configFileIn(dir);
    if (file !== undefined) files.push(file);
  };

  let current = resolve(startDir);
  while (current !== dirname(current)) {
    add(current);
    if (current === home) break;
    current = dirname(current);
  }
  add(home);
  return files;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, overVal] of Object.entries(override)) {
    const baseVal = base[key];
    result[key] =
      isPlainObject(overVal) && isPlainObject(baseVal) ? deepMerge(baseVal, overVal) : overVal;
  }
  return result;
}

/** Parse and validate one config file without applying defaults. */
function readConfigFile(file: string): Record<string, unknown> {
  let raw: unknown;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
    raw = parse(text);
  } catch (err) {
    throw configError(file, [err instanceof Error ? err.message : String(err)]);
  }
  // `parse` returns null for an empty document and for an explicit `null` or `~` scalar.
  if (raw === null && !isExplicitNull(text)) raw = {};
  if (!isPlainObject(raw)) throw configError(file, ["the top level must be a mapping"]);
  // An empty file sets nothing, so it needs no version.
  if (Object.keys(raw).length === 0) return raw;
  const version = raw["version"];
  // A newer format may rename or add keys, so report only the version mismatch.
  if (typeof version === "number" && Number.isInteger(version) && version > CONFIG_VERSION) {
    throw configError(file, [
      `\`version: ${version}\` needs a newer pr-shepherd; this release reads config version ${CONFIG_VERSION}`,
    ]);
  }
  const result = configFileSchema.safeParse(raw);
  if (!result.success) {
    throw configError(
      file,
      result.error.issues.flatMap((issue) =>
        issue.path.length === 1 && issue.path[0] === "version"
          ? [versionIssue(version)]
          : issueLines(issue, raw),
      ),
    );
  }
  return raw;
}

function isExplicitNull(text: string): boolean {
  const contents = parseDocument(text).contents;
  return isScalar(contents) && contents.source !== "";
}

function versionIssue(version: unknown): string {
  return version === undefined
    ? `\`version\` is required: add \`version: ${CONFIG_VERSION}\` (0.x config files have none; see docs/configuration.md#version)`
    : `\`version\` must be ${CONFIG_VERSION}`;
}

const configCache = new Map<string, PrShepherdConfig>();

/**
 * Load the config for the effective cwd: built-in defaults, then `$HOME`, then each ancestor
 * down to cwd, closest file winning. Any invalid file throws a `ShepherdError` (exit 78).
 */
export function loadConfig(): PrShepherdConfig {
  const cwd = getEffectiveCwd();
  const cached = configCache.get(cwd);
  if (cached !== undefined) return cached;

  const files = collectConfigFiles(cwd);
  // Farthest file first so closer directories override, ESLint-style.
  let overlay: Record<string, unknown> = {};
  for (const file of [...files].reverse()) overlay = deepMerge(overlay, readConfigFile(file));
  const config = resolveConfig(overlay, files.length > 0 ? files.join(", ") : undefined);
  configCache.set(cwd, config);
  return config;
}

/** Reset the config cache — for use in tests that change directories. */
export function _resetConfigCache(): void {
  configCache.clear();
}
