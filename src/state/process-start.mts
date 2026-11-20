import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface ProcessStartDeps {
  platform: NodeJS.Platform;
  readFile: (path: string) => string;
  ps: (pid: number) => string;
}

export const defaultProcessStartDeps: ProcessStartDeps = {
  platform: process.platform,
  readFile: (path) => readFileSync(path, "utf8"),
  ps: (pid) =>
    execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C" },
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }),
};

/** Field 22 of `/proc/<pid>/stat` (start time in ticks since boot); `comm` may contain spaces. */
export function parseLinuxStartTicks(stat: string): string | undefined {
  const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const ticks = rest[19];
  return ticks && /^\d+$/.test(ticks) ? ticks : undefined;
}

/**
 * An opaque token that identifies one process incarnation of `pid`: `/proc` start ticks on Linux,
 * `ps -o lstart=` elsewhere (macOS). Undefined when it cannot be read, for example when a
 * sandbox hides the process; callers must then fall back to PID liveness alone.
 */
export function readProcessStart(
  pid: number,
  deps: ProcessStartDeps = defaultProcessStartDeps,
): string | undefined {
  try {
    if (deps.platform === "linux") {
      const ticks = parseLinuxStartTicks(deps.readFile(`/proc/${pid}/stat`));
      return ticks && `linux:${ticks}`;
    }
    return deps.ps(pid).trim() || undefined;
  } catch {
    return undefined;
  }
}
