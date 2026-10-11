import { execFileSync } from "node:child_process";
import { accessSync, constants, lstatSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_PR_NUMBER, SAFE_SEGMENT } from "../util/path-segment.mts";
import { resolveDurableStateBase } from "./durable-state.mts";

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

/** Read once per process; null when the platform is not Linux or the shared base is unusable. */
let linuxUserStateBase: string | null | undefined;

/**
 * Linux has no per-user temp dir independent of `TMPDIR`, and sandboxed agent shells point
 * `TMPDIR` at their own directory (e.g. `/tmp/claude-<uid>`). Use `/tmp/pr-shepherd-state-<uid>`
 * instead so sandboxed and unsandboxed runs share state. `/tmp` is shared by every user, so the
 * directory must be a real directory (not a symlink) owned by this user and not writable by
 * anyone else; it must also be writable from this process. Otherwise fall back to `TMPDIR`.
 */
function readLinuxUserStateBase(): string | null {
  if (process.platform !== "linux" || typeof process.getuid !== "function") return null;
  const uid = process.getuid();
  const dir = join("/tmp", `pr-shepherd-state-${uid}`);
  try {
    mkdirSync(dir, { mode: 0o700 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") return null;
  }
  try {
    const stat = lstatSync(dir);
    if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o022) !== 0) return null;
    accessSync(dir, constants.W_OK);
    return dir;
  } catch {
    return null;
  }
}

export function resolveStateBase(): string {
  const envDir = process.env["PR_SHEPHERD_STATE_DIR"];
  if (envDir) return envDir;
  const durable = resolveDurableStateBase();
  if (durable) return durable;
  if (linuxUserStateBase === undefined) linuxUserStateBase = readLinuxUserStateBase();
  if (linuxUserStateBase) return linuxUserStateBase;
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
