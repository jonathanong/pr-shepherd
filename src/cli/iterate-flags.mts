import type { loadConfig } from "../config/load.mts";
import { getFlag, hasFlag } from "./args.mts";
import { parseDurationToMinutes } from "./exit-codes.mts";
import { validateDurationFlag } from "./duration-flag.mts";

interface IterateFlags {
  readyDelaySuffix: string | undefined | null;
  readyDelaySeconds: number;
  stallTimeoutSeconds: number;
  noAutoMarkReady: boolean;
  noAutoCancelActionable: boolean;
}

export function parseIterateFlags(
  extra: string[],
  cfg: ReturnType<typeof loadConfig>,
): IterateFlags {
  const readyDelayStr = getFlag(extra, "--ready-delay");
  const readyDelaySuffix = validateDurationFlag(
    "pr-shepherd",
    "--ready-delay",
    readyDelayStr,
    hasFlag(extra, "--ready-delay"),
  );
  const readyDelaySeconds =
    parseDurationToMinutes(readyDelaySuffix ?? "", cfg.watch.readyDelayMinutes) * 60;
  const noAutoMarkReady = hasFlag(extra, "--no-auto-mark-ready");
  const noAutoCancelActionable = hasFlag(extra, "--no-auto-cancel-actionable");
  const stallTimeoutStr = getFlag(extra, "--stall-timeout");
  const stallTimeoutSeconds = stallTimeoutStr
    ? parseDurationToMinutes(stallTimeoutStr, cfg.iterate.stallTimeoutMinutes) * 60
    : cfg.iterate.stallTimeoutMinutes * 60;
  return {
    readyDelaySuffix,
    readyDelaySeconds,
    stallTimeoutSeconds,
    noAutoMarkReady,
    noAutoCancelActionable,
  };
}
