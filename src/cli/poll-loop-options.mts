import { loadConfig } from "../config/load.mts";
import { parseCommonArgs, getFlag, hasFlag } from "./args.mts";
import { parseDurationToSeconds } from "./duration.mts";
import { validateSecondsDurationFlag } from "./duration-flag.mts";
import { hasInvalidIterateFlags, parseIterateFlags } from "./iterate-flags.mts";
import { EXIT } from "../exit-codes.mts";

export function parseLoopOptions(
  extra: string[],
  globalOpts: ReturnType<typeof parseCommonArgs>["global"],
  isAggregate: boolean,
) {
  const cfg = loadConfig();

  const flags = parseIterateFlags(extra, cfg);
  if (hasInvalidIterateFlags(flags)) return null;

  const intervalStr = getFlag(extra, "--interval");
  const intervalSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--interval",
    intervalStr,
    hasFlag(extra, "--interval"),
  );
  if (intervalSuffix === null) return null;
  let intervalSeconds = parseDurationToSeconds(intervalSuffix ?? "", cfg.poll["interval-seconds"]);
  // `--interval` is the invocation interval. Only an omitted flag is scaled, and only for aggregates.
  if (isAggregate && intervalSuffix === undefined) {
    intervalSeconds *= cfg.poll["stack-interval-factor"];
  }

  const timeoutStr = getFlag(extra, "--timeout");
  const timeoutSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--timeout",
    timeoutStr,
    hasFlag(extra, "--timeout"),
  );
  if (timeoutSuffix === null) return null;
  const timeoutSeconds = parseDurationToSeconds(timeoutSuffix ?? "", cfg.poll["timeout-seconds"]);

  const debounceStr = getFlag(extra, "--debounce");
  const debounceSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--debounce",
    debounceStr,
    hasFlag(extra, "--debounce"),
    { allowZero: true },
  );
  if (debounceSuffix === null) return null;
  const debounceSeconds = parseDurationToSeconds(
    debounceSuffix ?? "",
    cfg.poll["debounce-seconds"],
    {
      allowZero: true,
    },
  );

  const quietStatusFlag = hasFlag(extra, "--quiet-status");
  const noQuietStatusFlag = hasFlag(extra, "--no-quiet-status");
  if (quietStatusFlag && noQuietStatusFlag) {
    process.stderr.write(
      "pr-shepherd: --quiet-status and --no-quiet-status cannot be used together\n",
    );
    process.exitCode = EXIT.USAGE;
    return null;
  }
  const quietStatus = quietStatusFlag || (!noQuietStatusFlag && cfg.poll["quiet-status"]);

  return {
    readyDelaySuffix: flags.readyDelaySuffix ?? undefined,
    options: {
      ...globalOpts,
      readyDelaySeconds: flags.readyDelaySeconds,
      stallTimeoutSeconds: flags.stallTimeoutSeconds,
      noAutoMarkReady: flags.noAutoMarkReady,
      merge: flags.merge,
      instructions: flags.instructions ?? undefined,
      ...(flags.stackLayers && { stackLayers: flags.stackLayers }),
      intervalSeconds,
      timeoutSeconds,
      debounceSeconds,
      quietStatus,
      untilTerminal: hasFlag(extra, "--until-terminal"),
    },
  };
}
