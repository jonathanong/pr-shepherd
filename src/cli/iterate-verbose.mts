import type { IterateResult } from "../types.mts";
import { adaptIterateLog, buildSimpleIterateInstructions } from "./iterate-instructions.mts";
import { projectEditedComments } from "./edited-comments-format.mts";

interface IterateProjectionOptions {
  readyDelaySuffix?: string;
}

export function projectIterateVerbose(
  result: IterateResult,
  opts?: IterateProjectionOptions,
): unknown {
  const readyDelaySuffix = opts?.readyDelaySuffix;
  const readyDelayOverride = readyDelaySuffix ? { readyDelayOverride: readyDelaySuffix } : {};
  // Edited comments use the lean projection: their bookkeeping fields have no Markdown form.
  const edited = result.editedComments && {
    editedComments: projectEditedComments(result.editedComments),
  };
  if (result.action === "triage") return { ...result, ...readyDelayOverride, ...edited };
  const log =
    "log" in result && typeof result.log === "string" ? { log: adaptIterateLog(result.log) } : {};
  // `cancel` has no instructions, so verbose JSON omits the field as verbose Markdown omits the section.
  const instructions =
    result.action === "cancel" ? {} : { instructions: buildSimpleIterateInstructions(result) };
  return { ...result, ...log, ...readyDelayOverride, ...instructions, ...edited };
}
