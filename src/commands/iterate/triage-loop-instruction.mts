import { renderShellCommand } from "../../cli/runner.mts";
import { loadConfig } from "../../config/load.mts";
import type { InstructionStyle } from "../../config/load.mts";
import { playbookPointer } from "../playbook-pointer.mts";

const TRIAGE_LOOP_PLAYBOOK = "Triage loop";

/** The generic push stays separate from conflict and queue-recovery push instructions. */
export function buildPushSteps(style: InstructionStyle, genericPush: boolean): string[] {
  if (!genericPush) return [];
  const push = "Commit and push any changes.";
  if (style === "inline") return [push];
  const cli = renderShellCommand([
    ...loadConfig()["cli-command"],
    "playbook",
    TRIAGE_LOOP_PLAYBOOK,
  ]);
  return [`${push} ${playbookPointer(TRIAGE_LOOP_PLAYBOOK)} CLI: \`${cli}\`.`];
}
