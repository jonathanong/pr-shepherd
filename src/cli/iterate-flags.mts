import {
  INSTRUCTION_STYLES,
  POLL_MODES,
  isInstructionStyle,
  isPollMode,
  type loadConfig,
  type InstructionStyle,
  type PollMode,
} from "../config/load.mts";
import { EXIT } from "../exit-codes.mts";
import { getFlag, hasFlag } from "./args.mts";
import { parseDurationToSeconds } from "./duration.mts";
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
  merge: boolean;
  /** `null` when `--instructions` was invalid (an error was already printed). */
  instructions: InstructionStyle | null | undefined;
  /** `null` when `--poll-mode` was invalid (an error was already printed). */
  pollMode: PollMode | null | undefined;
}

/** True when any flag failed validation; the usage error is already printed. */
export function hasInvalidIterateFlags(flags: IterateFlags): boolean {
  return (
    flags.readyDelaySuffix === null ||
    flags.stallTimeoutSuffix === null ||
    flags.instructions === null ||
    flags.pollMode === null
  );
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
  const merge = hasFlag(extra, "--merge");
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
  const instructions = parseInstructionsFlag(extra);
  return {
    instructions,
    pollMode: parsePollModeFlag(extra),
    readyDelaySuffix,
    readyDelaySeconds,
    stallTimeoutSuffix,
    stallTimeoutSeconds,
    noAutoMarkReady,
    noAutoCancelActionable,
    merge,
  };
}

/** Validate `--instructions`. Returns `undefined` when absent, `null` after printing a usage error. */
function parseInstructionsFlag(extra: string[]): InstructionStyle | null | undefined {
  const value = getFlag(extra, "--instructions");
  if (!hasInstructionsFlag(extra)) return undefined;
  if (isInstructionStyle(value)) return value;
  process.stderr.write(
    `pr-shepherd: --instructions must be one of ${INSTRUCTION_STYLES.join(", ")}, got ${JSON.stringify(value ?? "")}\n`,
  );
  process.exitCode = EXIT.USAGE;
  return null;
}

function hasInstructionsFlag(extra: string[]): boolean {
  return extra.some((arg) => arg === "--instructions" || arg.startsWith("--instructions="));
}

/** Validate `--poll-mode`. Returns `undefined` when absent, `null` after printing a usage error. */
function parsePollModeFlag(extra: string[]): PollMode | null | undefined {
  const value = getFlag(extra, "--poll-mode");
  if (!extra.some((arg) => arg === "--poll-mode" || arg.startsWith("--poll-mode="))) {
    return undefined;
  }
  if (isPollMode(value)) return value;
  process.stderr.write(
    `pr-shepherd: --poll-mode must be one of ${POLL_MODES.join(", ")}, got ${JSON.stringify(value ?? "")}\n`,
  );
  process.exitCode = EXIT.USAGE;
  return null;
}
