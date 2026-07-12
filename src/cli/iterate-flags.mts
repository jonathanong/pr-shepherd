import type { loadConfig } from "../config/load.mts";
import { getFlag, hasFlag } from "./args.mts";
import { parseDurationToSeconds } from "./exit-codes.mts";
import { validateSecondsDurationFlag } from "./duration-flag.mts";

// --ready-delay and --stall-timeout are minute-family flags: a bare number means minutes, and 0 is a
// valid value (it disables the ready-delay settle window / stall-timeout escalation, respectively).
const MINUTE_FLAG_OPTS = { defaultUnit: "m", allowZero: true } as const;

interface IterateFlags {
  readyDelaySuffix: string | undefined | null;
  readyDelaySeconds: number;
  stallTimeoutSuffix: string | undefined | null;
  stallTimeoutSeconds: number;
  noAutoMarkReady: boolean;
  noAutoCancelActionable: boolean;
}

export function parseIterateFlags(
  extra: string[],
  cfg: ReturnType<typeof loadConfig>,
): IterateFlags {
  const readyDelayStr = getFlag(extra, "--ready-delay");
  const readyDelaySuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--ready-delay",
    readyDelayStr,
    hasFlag(extra, "--ready-delay"),
    MINUTE_FLAG_OPTS,
  );
  const readyDelaySeconds = parseDurationToSeconds(
    readyDelaySuffix ?? "",
    cfg.watch.readyDelayMinutes * 60,
    MINUTE_FLAG_OPTS,
  );
  const noAutoMarkReady = hasFlag(extra, "--no-auto-mark-ready");
  const noAutoCancelActionable = hasFlag(extra, "--no-auto-cancel-actionable");
  const stallTimeoutStr = getFlag(extra, "--stall-timeout");
  const stallTimeoutSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--stall-timeout",
    stallTimeoutStr,
    hasFlag(extra, "--stall-timeout"),
    MINUTE_FLAG_OPTS,
  );
  const stallTimeoutSeconds = parseDurationToSeconds(
    stallTimeoutSuffix ?? "",
    cfg.iterate.stallTimeoutMinutes * 60,
    MINUTE_FLAG_OPTS,
  );
  return {
    readyDelaySuffix,
    readyDelaySeconds,
    stallTimeoutSuffix,
    stallTimeoutSeconds,
    noAutoMarkReady,
    noAutoCancelActionable,
  };
}
