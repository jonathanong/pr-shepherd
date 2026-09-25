import { execFileSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_PR_NUMBER, SAFE_SEGMENT } from "../util/path-segment.mts";

/** Read once per process; null when the platform or `getconf` offers no per-user temp dir. */
let darwinUserTempDir: string | null | undefined;

/**
 * macOS's per-user temp dir, read from `confstr(_CS_DARWIN_USER_TEMP_DIR)` rather than
 * `TMPDIR`. Sandboxed agent shells point `TMPDIR` at their own directory, so the same user's
 * sandboxed CLI, unsandboxed CLI, and MCP server would otherwise keep separate state.
 */
function readDarwinUserTempDir(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const dir = execFileSync("/usr/bin/getconf", ["DARWIN_USER_TEMP_DIR"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return isAbsolute(dir) ? dir : null;
  } catch {
    return null;
  }
}

export function resolveStateBase(): string {
  const envDir = process.env["PR_SHEPHERD_STATE_DIR"];
  if (envDir) return envDir;
  if (darwinUserTempDir === undefined) darwinUserTempDir = readDarwinUserTempDir();
  return join(darwinUserTempDir ?? tmpdir(), "pr-shepherd-state");
}

/**
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/...parts`.
 * Owner, repo, PR number, and each extra part must be a safe path segment.
 */
export function resolvePrStatePath(
  key: { owner: string; repo: string; pr: number },
  ...parts: string[]
): string {
  return resolveRepoStatePath(key, numberSegment("pr", key.pr), parts);
}

/**
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/stack-<number>/...parts`, beside the per-PR directories.
 * Owner, repo, stack number, and each extra part must be a safe path segment.
 */
export function resolveStackStatePath(
  key: { owner: string; repo: string; stack: number },
  ...parts: string[]
): string {
  return resolveRepoStatePath(key, `stack-${numberSegment("stack", key.stack)}`, parts);
}

/**
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>`.
 * Owner and repo are separate segments so names that contain hyphens cannot collide.
 */
export function resolveRepoStateDir(key: { owner: string; repo: string }): string {
  assertOwnerRepo(key);
  return join(resolveStateBase(), key.owner, key.repo);
}

function numberSegment(name: string, value: number): string {
  const segment = String(value);
  if (!SAFE_PR_NUMBER.test(segment)) {
    throw new Error(`Invalid state key segment "${name}": ${value}`);
  }
  return segment;
}

function assertRepoSegment(name: "owner" | "repo", value: string): void {
  // `.` and `..` match SAFE_SEGMENT, but they are real path segments here and would escape the base.
  if (!SAFE_SEGMENT.test(value) || value === "." || value === "..") {
    throw new Error(`Invalid state key segment "${name}": ${value}`);
  }
}

function assertOwnerRepo(key: { owner: string; repo: string }): void {
  assertRepoSegment("owner", key.owner);
  assertRepoSegment("repo", key.repo);
}

function resolveRepoStatePath(
  key: { owner: string; repo: string },
  entry: string,
  parts: string[],
): string {
  assertOwnerRepo(key);
  for (const part of parts) {
    if (!SAFE_SEGMENT.test(part) || part === "." || part === "..") {
      throw new Error(`Invalid state key segment: ${part}`);
    }
  }
  return join(resolveRepoStateDir(key), entry, ...parts);
}
