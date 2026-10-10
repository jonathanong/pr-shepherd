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
 *
 * `commit` is false when a conflict or queue-recovery push step already tells the caller to push.
 */
function buildFixLoopInstruction(
  prReference: string | number,
  opts: { commit: boolean; journal: boolean },
): string {
  const parts: string[] = [];
  if (opts.commit) parts.push("Commit and push any code changes.");
  if (opts.journal)
    parts.push(
      `Journal substantial decisions or rejections with \`${buildShepherdJournalCommand(prReference)}\`.`,
    );
  const cli = renderShellCommand([...loadConfig().cliCommand, "playbook", FIX_CODE_LOOP_PLAYBOOK]);
  parts.push(`${playbookPointer(FIX_CODE_LOOP_PLAYBOOK)} CLI: \`${cli}\`.`);
  return parts.join(" ");
}

/**
 * The generic commit/push step and the journal step. Playbook style folds both into one pointer;
 * the rerun step stays inline because it is the one step a halted loop cannot recover from.
 */
export function buildPushJournalSteps(
  style: InstructionStyle,
  prReference: string | number,
  genericPush: boolean,
  wantsJournal: boolean,
): string[] {
  if (style === "playbook" && (genericPush || wantsJournal))
    return [buildFixLoopInstruction(prReference, { commit: genericPush, journal: wantsJournal })];
  const steps: string[] = [];
  if (genericPush)
    steps.push(
      "If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.",
    );
  if (wantsJournal) steps.push(buildShepherdJournalInstruction(prReference));
  return steps;
}
