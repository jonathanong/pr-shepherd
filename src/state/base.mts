import { accessSync, constants, lstatSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_PR_NUMBER, SAFE_SEGMENT } from "../util/path-segment.mts";
import { resolveDurableStateBase } from "./durable-state.mts";
import { isReadOnly } from "../execution-context.mts";

/** Read once per process; null when the platform is not Linux or the shared base is unusable. */
let linuxUserStateBase: string | null | undefined;

/**
 * Linux has no per-user temp dir independent of `TMPDIR`, and sandboxed agent shells point
 * `TMPDIR` at their own directory (e.g. `/tmp/claude-<uid>`). Use `/tmp/pr-shepherd-state-<uid>`
 * instead so sandboxed and unsandboxed runs share state. `/tmp` is shared by every user, so the
 * directory must be a real directory (not a symlink) owned by this user and not writable by
 * anyone else; it must also be readable, writable, and searchable from this process. Otherwise fall back to `TMPDIR`.
 */
function readLinuxUserStateBase(create: boolean): string | null {
  if (process.platform !== "linux" || typeof process.getuid !== "function") return null;
  const uid = process.getuid();
  const dir = join("/tmp", `pr-shepherd-state-${uid}`);
  if (create) {
    try {
      mkdirSync(dir, { mode: 0o700 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") return null;
    }
  }
  try {
    const stat = lstatSync(dir);
    if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o022) !== 0) return null;
    accessSync(dir, constants.R_OK | constants.W_OK | constants.X_OK);
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
  if (linuxUserStateBase === undefined) {
    // A read-only scope never creates the shared base. A base that does not exist yet holds no
    // state to read, so do not cache that answer: the next writing call must still create it.
    const base = readLinuxUserStateBase(!isReadOnly());
    if (base !== null || !isReadOnly()) linuxUserStateBase = base;
    if (base !== null) return base;
  }
  if (linuxUserStateBase) return linuxUserStateBase;
  return join(tmpdir(), "pr-shepherd-state");
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
