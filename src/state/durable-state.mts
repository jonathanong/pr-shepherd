import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { getEffectiveCwd } from "../execution-context.mts";

/**
 * A cloud session can be recycled between ticks, and its temp dir with it. The git common
 * directory lives with the repository checkout, so state stored there survives whatever the
 * session does with `TMPDIR`. Only a read-only `git rev-parse` is ever invoked.
 */
const commonDirByCwd = new Map<string, string | null>();

/** Cloud sessions keep state (seen markers, stall timers, reply records) beyond a temp dir. */
export function durableStateRequested(): boolean {
  return process.env["CLAUDE_CODE_REMOTE"] === "true";
}

/** `<git-common-dir>/pr-shepherd-state`, or null when not requested or outside a repository. */
export function resolveDurableStateBase(): string | null {
  if (!durableStateRequested()) return null;
  const cwd = getEffectiveCwd();
  if (!commonDirByCwd.has(cwd)) commonDirByCwd.set(cwd, readCommonDir(cwd));
  return commonDirByCwd.get(cwd) ?? null;
}

function readCommonDir(cwd: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out ? join(resolve(cwd, out), "pr-shepherd-state") : null;
  } catch {
    return null;
  }
}
