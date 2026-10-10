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
  // `cancel` has no instructions, so verbose JSON omits the field as verbose Markdown omits the section.
  const instructions =
    result.action === "cancel" ? {} : { instructions: buildSimpleIterateInstructions(result) };
  return { ...result, ...log, ...readyDelayOverride, ...instructions };
}
