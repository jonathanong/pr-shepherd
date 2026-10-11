import { renderShellCommand } from "../../cli/runner.mts";
import { loadConfig } from "../../config/load.mts";
import type { InstructionStyle } from "../../config/load.mts";
import {
  buildShepherdJournalCommand,
  buildShepherdJournalInstruction,
} from "../shepherd-journal.mts";
import { playbookPointer } from "../playbook-pointer.mts";

const FIX_CODE_LOOP_PLAYBOOK = "Fix-code loop";

/**
 * Playbook-style replacement for the invariant commit/push and journal steps. The
 * procedure text lives in the "Fix-code loop" playbook; only the trigger and the concrete
 * journal command stay in the per-tick output. `inline` style never calls this.
 */
function buildFixLoopInstruction(prReference: string | number, journal: boolean): string {
  const parts = ["Commit and push any changes."];
  if (journal)
    parts.push(
      `Journal substantial decisions or rejections with \`${buildShepherdJournalCommand(prReference)}\`.`,
    );
  const cli = renderShellCommand([...loadConfig().cliCommand, "playbook", FIX_CODE_LOOP_PLAYBOOK]);
  parts.push(`${playbookPointer(FIX_CODE_LOOP_PLAYBOOK)} CLI: \`${cli}\`.`);
  return parts.join(" ");
}

/**
 * The generic commit/push step and the journal step. Playbook style folds both into one pointer
 * only when the generic push applies: the "Fix-code loop" playbook tells the caller to push to the
 * PR head branch, which would conflict with a conflict or queue-recovery push step. Without the
 * generic push, the journal step stays inline with its citation clause. The rerun
 * step stays inline because it is the one step a halted loop cannot recover from.
 */
export function buildPushJournalSteps(
  style: InstructionStyle,
  prReference: string | number,
  genericPush: boolean,
  wantsJournal: boolean,
): string[] {
  if (style === "playbook" && genericPush)
    return [buildFixLoopInstruction(prReference, wantsJournal)];
  const steps: string[] = [];
  if (genericPush) steps.push("Commit and push any changes.");
  if (wantsJournal) steps.push(buildShepherdJournalInstruction(prReference));
  return steps;
}
