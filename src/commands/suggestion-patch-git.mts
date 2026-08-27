import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import { getExecutionCwd } from "../execution-context.mts";

const execFile = promisify(execFileCb);

export async function getLocalHeadSha(): Promise<string> {
  const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
    cwd: getExecutionCwd(),
  });
  return stdout.trim();
}

export async function isAncestor(ancestor: string, descendant: string): Promise<boolean> {
  try {
    await execFile("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: getExecutionCwd(),
    });
    return true;
  } catch (error) {
    if (isExitCode(error, 1) || isExitCode(error, 128)) return false;
    throw error;
  }
}

export async function readPrHeadFile(headSha: string, path: string): Promise<string> {
  const { stdout } = await execFile("git", ["show", `${headSha}:${path}`], {
    cwd: getExecutionCwd(),
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

export async function getPathsStatus(paths: readonly string[]): Promise<string> {
  const { stdout } = await execFile("git", ["status", "--porcelain", "--", ...paths], {
    cwd: getExecutionCwd(),
  });
  return stdout.trim();
}

/** Dry-run an ordered patch stream against the current worktree. */
export function checkPatchesApply(patches: readonly string[]): Promise<void> {
  const input = patches.join("\n");
  return new Promise((resolve, reject) => {
    const child = execFileCb(
      "git",
      ["apply", "--check"],
      { cwd: getExecutionCwd() },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || error.message));
      },
    );
    child.stdin!.end(input);
  });
}

function isExitCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
