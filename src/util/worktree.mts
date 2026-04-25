import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { SAFE_SEGMENT } from "./path-segment.mts";

const execFile = promisify(execFileCb);

/** Returns the absolute path to the current git worktree root. Throws outside a git repo. */
export async function getWorktreeRoot(): Promise<string> {
  const { stdout } = await execFile("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

/**
 * Returns a filesystem-safe key for the current worktree, unique across
 * worktrees of the same repo. Format: `<basename>-<sha8>` where sha8 is
 * the first 8 hex chars of sha256(toplevel). Falls back to sha8-only if
 * the basename contains characters outside SAFE_SEGMENT.
 */
export async function getWorktreeKey(): Promise<string> {
  const root = await getWorktreeRoot();
  const sha8 = createHash("sha256").update(root).digest("hex").slice(0, 8);
  const base = basename(root);
  return SAFE_SEGMENT.test(base) ? `${base}-${sha8}` : sha8;
}
