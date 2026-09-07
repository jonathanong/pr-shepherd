import { runPoll } from "../commands/poll.mts";
import { loadConfig } from "../config/load.mts";
import { parseCommonArgs, getFlag, hasFlag } from "./args.mts";
import { parseDurationToSeconds } from "./duration.mts";
import { validateSecondsDurationFlag } from "./duration-flag.mts";
import { parseIterateFlags } from "./iterate-flags.mts";
import { emitIterateResult } from "./iterate-emitter.mts";
import { EXIT } from "../exit-codes.mts";

export async function handlePoll(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const cfg = loadConfig();

  const flags = parseIterateFlags(extra, cfg);
  if (flags.readyDelaySuffix === null || flags.stallTimeoutSuffix === null) return;

  const intervalStr = getFlag(extra, "--interval");
  const intervalSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--interval",
    intervalStr,
    hasFlag(extra, "--interval"),
  );
  if (intervalSuffix === null) return;
  const intervalSeconds = parseDurationToSeconds(intervalSuffix ?? "", cfg.poll.intervalSeconds);

  const timeoutStr = getFlag(extra, "--timeout");
  const timeoutSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--timeout",
    timeoutStr,
    hasFlag(extra, "--timeout"),
  );
  if (timeoutSuffix === null) return;
  const timeoutSeconds = parseDurationToSeconds(timeoutSuffix ?? "", cfg.poll.timeoutSeconds);

  const debounceStr = getFlag(extra, "--debounce");
  const debounceSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--debounce",
    debounceStr,
    hasFlag(extra, "--debounce"),
    { allowZero: true },
  );
  if (debounceSuffix === null) return;
  const debounceSeconds = parseDurationToSeconds(debounceSuffix ?? "", cfg.poll.debounceSeconds, {
    allowZero: true,
  });

  const quietStatusFlag = hasFlag(extra, "--quiet-status");
  const noQuietStatusFlag = hasFlag(extra, "--no-quiet-status");
  if (quietStatusFlag && noQuietStatusFlag) {
    process.stderr.write(
      "pr-shepherd: --quiet-status and --no-quiet-status cannot be used together\n",
    );
    process.exitCode = EXIT.USAGE;
    return;
  }
  const quietStatus = quietStatusFlag || (!noQuietStatusFlag && cfg.poll.quietStatus);

  const result = await runPoll({
    ...globalOpts,
    prNumber,
    readyDelaySeconds: flags.readyDelaySeconds,
    stallTimeoutSeconds: flags.stallTimeoutSeconds,
    noAutoMarkReady: flags.noAutoMarkReady,
    noAutoCancelActionable: flags.noAutoCancelActionable,
    merge: flags.merge,
    intervalSeconds,
    timeoutSeconds,
    debounceSeconds,
    quietStatus,
    untilTerminal: hasFlag(extra, "--until-terminal"),
  });

  emitIterateResult(result, {
    format: globalOpts.format,
    verbose: globalOpts.verbose ?? false,
    readyDelaySuffix: flags.readyDelaySuffix ?? undefined,
  });
}
