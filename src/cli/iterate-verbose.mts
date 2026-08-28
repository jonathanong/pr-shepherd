import type { IterateResult } from "../types.mts";
import { adaptIterateLog, buildSimpleIterateInstructions } from "./iterate-instructions.mts";

interface IterateProjectionOptions {
  readyDelaySuffix?: string;
}

export function projectIterateVerbose(
  result: IterateResult,
  opts?: IterateProjectionOptions,
): unknown {
  const readyDelaySuffix = opts?.readyDelaySuffix;
  const readyDelayOverride = readyDelaySuffix ? { readyDelayOverride: readyDelaySuffix } : {};
  if (result.action === "fix_code") return { ...result, ...readyDelayOverride };
  const log =
    "log" in result && typeof result.log === "string" ? { log: adaptIterateLog(result.log) } : {};
  return {
    ...result,
    ...log,
    ...readyDelayOverride,
    instructions: buildSimpleIterateInstructions(result),
  };
}
