import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { parse } from "yaml";
import { EXIT, ShepherdError } from "../exit-codes.mts";

export interface GithubApp {
  appId: number;
  /** Absolute path of the PEM private key. */
  privateKeyFile: string;
  /** Lowercased `owner/*` or `owner/repo` patterns. */
  repositories: string[];
}

const APP_KEYS = ["app-id", "private-key-file", "repositories"];
const PATTERN = /^[A-Za-z0-9._-]+\/(\*|[A-Za-z0-9._-]+)$/;

let cached: GithubApp[] | undefined;

export function _resetGithubApps(): void {
  cached = undefined;
}

/** User-level state directory. `PR_SHEPHERD_HOME` exists so tests never touch the real home. */
function shepherdHome(): string {
  return process.env["PR_SHEPHERD_HOME"] || join(homedir(), ".pr-shepherd");
}

function githubAppsFile(): string {
  return join(shepherdHome(), "github-apps.yml");
}

function fail(file: string, message: string): never {
  throw new ShepherdError(`${file}: ${message}`, EXIT.CONFIG);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  file: string,
  where: string,
  node: Record<string, unknown>,
  keys: string[],
): void {
  for (const key of Object.keys(node)) {
    if (!keys.includes(key)) fail(file, `unknown key "${key}" in ${where}`);
  }
}

function keyPath(file: string, where: string, value: unknown): string {
  if (typeof value !== "string" || value === "") {
    fail(file, `${where}.private-key-file must be a non-empty path`);
  }
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return isAbsolute(value) ? value : join(shepherdHome(), value);
}

function patterns(file: string, where: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(file, `${where}.repositories must be a non-empty list`);
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || !PATTERN.test(entry)) {
      fail(
        file,
        `${where}.repositories entry ${JSON.stringify(entry)} must be "owner/*" or "owner/repo"`,
      );
    }
    return entry.toLowerCase();
  });
}

function parseApp(file: string, index: number, node: unknown): GithubApp {
  const where = `apps[${index}]`;
  if (!isRecord(node)) fail(file, `${where} must be a mapping`);
  rejectUnknownKeys(file, where, node, APP_KEYS);
  const appId = node["app-id"];
  if (typeof appId !== "number" || !Number.isSafeInteger(appId) || appId <= 0) {
    fail(file, `${where}.app-id must be a positive integer`);
  }
  return {
    appId,
    privateKeyFile: keyPath(file, where, node["private-key-file"]),
    repositories: patterns(file, where, node["repositories"]),
  };
}

function parseApps(file: string, text: string): GithubApp[] {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (error) {
    return fail(file, `invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(doc)) fail(file, "must be a mapping with an `apps` list");
  rejectUnknownKeys(file, "the file", doc, ["apps"]);
  const apps = doc["apps"];
  if (!Array.isArray(apps) || apps.length === 0) fail(file, "`apps` must be a non-empty list");
  return apps.map((node, index) => parseApp(file, index, node));
}

/** Read `github-apps.yml` once per process. A missing file turns the feature off. */
export function loadGithubApps(): GithubApp[] {
  if (cached) return cached;
  const file = githubAppsFile();
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return (cached = []);
    return fail(file, `cannot read: ${error instanceof Error ? error.message : String(error)}`);
  }
  return (cached = parseApps(file, text));
}

/** First listed app whose patterns match the repository. Matching ignores case. */
export function findGithubApp(owner: string, repo: string): GithubApp | undefined {
  const full = `${owner}/${repo}`.toLowerCase();
  const wildcard = `${owner.toLowerCase()}/*`;
  return loadGithubApps().find((app) =>
    app.repositories.some((pattern) => pattern === full || pattern === wildcard),
  );
}
