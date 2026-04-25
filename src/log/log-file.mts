/**
 * Append-only per-worktree markdown log.
 *
 * Log path: $PR_SHEPHERD_STATE_DIR/<owner>-<repo>/worktrees/<basename>-<sha8>.md
 *
 * Always-on by default. Set PR_SHEPHERD_LOG_DISABLED=1 or CI=true to disable.
 * Write failures flip an internal disabled flag so the CLI never crashes because
 * logging failed.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveStateBase } from "../state/base.mts";
import { SAFE_SEGMENT } from "../util/path-segment.mts";
import { getWorktreeKey } from "../util/worktree.mts";

function computeDisabled(): boolean {
  if (process.env["PR_SHEPHERD_LOG_DISABLED"] === "1") return true;
  const ci = process.env["CI"];
  return ci !== undefined && ci !== "" && ci !== "0" && ci !== "false";
}

let _disabled = computeDisabled();

let _logPath: string | null = null;
let _entryCounter = 0;

/** Returns the next monotonically-increasing entry number for the current session. */
export function nextEntry(): number {
  return ++_entryCounter;
}

export interface RepoKey {
  owner: string;
  repo: string;
}

export function getLogFilePath(key: RepoKey): string {
  const { owner, repo } = key;
  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) {
    throw new Error(`Invalid repo key segments: ${owner}/${repo}`);
  }
  const base = resolveStateBase();
  // Worktree key injected at init time; fall back to "unknown" if not yet set.
  const wkey = _worktreeKey ?? "unknown";
  return join(base, `${owner}-${repo}`, "worktrees", `${wkey}.md`);
}

let _worktreeKey: string | null = null;

/**
 * Initialize the log for this process. Must be called before appendEntry().
 * Silently disables logging on any error (no git repo, bad repo name, etc.).
 */
export async function initLog(repoKey: RepoKey): Promise<string | null> {
  if (_disabled) return null;
  try {
    const { owner, repo } = repoKey;
    if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) return null;
    _worktreeKey = await getWorktreeKey();
    const path = getLogFilePath(repoKey);
    mkdirSync(dirname(path), { recursive: true });
    _logPath = path;
    return path;
  } catch {
    _disabled = true;
    return null;
  }
}

/** Append a pre-formatted markdown chunk to the log. No-op if disabled. */
export function appendEntry(markdown: string): void {
  if (_disabled || _logPath === null) return;
  try {
    appendFileSync(_logPath, markdown);
  } catch (e) {
    process.stderr.write(`pr-shepherd: log write failed (disabling log): ${String(e)}\n`);
    _disabled = true;
  }
}

/** Resolve the log path without initializing (for the log-file subcommand). */
export async function resolveLogPath(repoKey: RepoKey): Promise<string> {
  if (!SAFE_SEGMENT.test(repoKey.owner) || !SAFE_SEGMENT.test(repoKey.repo)) {
    throw new Error(`Invalid repo key segments: ${repoKey.owner}/${repoKey.repo}`);
  }
  const wkey = await getWorktreeKey();
  const base = resolveStateBase();
  return join(base, `${repoKey.owner}-${repoKey.repo}`, "worktrees", `${wkey}.md`);
}

/** Exposed for tests to reset module state. */
export function _resetLogState(): void {
  _disabled = computeDisabled();
  _logPath = null;
  _worktreeKey = null;
  _entryCounter = 0;
}
