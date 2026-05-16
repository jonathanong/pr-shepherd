import { runPoll } from "../commands/poll.mts";
import { loadConfig } from "../config/load.mts";
import { detectAgentRuntime } from "../agent-runtime.mts";
import { parseCommonArgs, getFlag, hasFlag } from "./args.mts";
import { parseDurationToSeconds, iterateActionToExitCode } from "./exit-codes.mts";
import { formatIterateResult, projectIterateLean, projectIterateVerbose } from "./formatters.mts";
import { validateSecondsDurationFlag } from "./duration-flag.mts";
import { parseIterateFlags } from "./iterate-flags.mts";

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const DEFAULT_POLL_TIMEOUT_SECONDS = 300;

export async function handlePoll(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const runtime = detectAgentRuntime();
  const cfg = loadConfig();

  const flags = parseIterateFlags(extra, cfg);
  if (flags.readyDelaySuffix === null) return;

  const intervalStr = getFlag(extra, "--interval");
  const intervalSuffix = validateSecondsDurationFlag(
    "pr-shepherd poll",
    "--interval",
    intervalStr,
    hasFlag(extra, "--interval"),
  );
  if (intervalSuffix === null) return;
  const intervalSeconds = parseDurationToSeconds(
    intervalSuffix ?? "",
    DEFAULT_POLL_INTERVAL_SECONDS,
  );

  const timeoutStr = getFlag(extra, "--timeout");
  const timeoutSuffix = validateSecondsDurationFlag(
    "pr-shepherd poll",
    "--timeout",
    timeoutStr,
    hasFlag(extra, "--timeout"),
  );
  if (timeoutSuffix === null) return;
  const timeoutSeconds = parseDurationToSeconds(timeoutSuffix ?? "", DEFAULT_POLL_TIMEOUT_SECONDS);

  if (globalOpts.verbose) {
    process.env["SHEPHERD_POLL_VERBOSE"] = "1";
  }

  const result = await runPoll({
    ...globalOpts,
    prNumber,
    readyDelaySeconds: flags.readyDelaySeconds,
    stallTimeoutSeconds: flags.stallTimeoutSeconds,
    noAutoMarkReady: flags.noAutoMarkReady,
    noAutoCancelActionable: flags.noAutoCancelActionable,
    intervalSeconds,
    timeoutSeconds,
  });

  const projectionOpts = {
    runtime,
    readyDelaySuffix: flags.readyDelaySuffix ?? undefined,
    runner: cfg.cli?.runner,
  };
  if (globalOpts.format === "json") {
    const output = globalOpts.verbose
      ? projectIterateVerbose(result, projectionOpts)
      : projectIterateLean(result, projectionOpts);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    const text = formatIterateResult(result, { verbose: globalOpts.verbose, ...projectionOpts });
    process.stdout.write(`${text}\n`);
  }

  process.exitCode = iterateActionToExitCode(result.action);
}
