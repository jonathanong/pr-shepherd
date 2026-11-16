// @ts-nocheck
/**
 * "No-op agent" simulation: after a `triage` tick the agent pushes nothing and edits no code. It
 * only runs the review mutations and `rerun:` commands the CLI generated, then calls iterate
 * again on the same head. The state the CLI persisted on each tick is carried to the next one.
 */
import { vi } from "vitest";
import { applyFixture, runMain } from "./harness.mts";
import { applyAgentEffects } from "./no-op-effects.mts";
import { hashBody, loadSeenMap, markSeen } from "../../src/state/seen-comments.mts";
import { readStallState, writeStallState } from "../../src/state/iterate-stall.mts";
import { writeFixAttempts } from "../../src/state/fix-attempts.mts";
import { writeCheckFollowUp, writeShownRunFailures } from "../../src/state/check-follow-up.mts";
import { readCiRetrigger, writeCiRetrigger } from "../../src/state/ci-retrigger.mts";
import {
  readQueueRemovalFollowUp,
  writeQueueRemovalFollowUp,
} from "../../src/state/queue-removal-follow-up.mts";
import { readCiStartFollowUp, writeCiStartFollowUp } from "../../src/state/ci-start-follow-up.mts";

export const MAX_TICKS = 4;

const WRITERS = [
  markSeen,
  writeStallState,
  writeFixAttempts,
  writeCheckFollowUp,
  writeShownRunFailures,
  writeCiRetrigger,
  writeQueueRemovalFollowUp,
  writeCiStartFollowUp,
];

const lastCall = (fn) => vi.mocked(fn).mock.calls.at(-1);

/** Everything the CLI persisted that the next tick reads back. */
function newCarry(fixture) {
  return {
    seen: new Map(Object.entries(fixture.seenMap ?? {})),
    queueRemoval: new Set(),
    ciStart: new Set(),
    stall: null,
    ciRetrigger: undefined,
  };
}

function absorbWrites(carry, fixture) {
  for (const [, id, body] of vi.mocked(markSeen).mock.calls) {
    carry.seen.set(id, { ...carry.seen.get(id), seenAt: 1, id, bodyHash: hashBody(body) });
  }
  fixture.fixAttempts = lastCall(writeFixAttempts)?.[1] ?? fixture.fixAttempts;
  fixture.checkFollowUp = lastCall(writeCheckFollowUp)?.[1] ?? fixture.checkFollowUp;
  fixture.shownRunFailures = lastCall(writeShownRunFailures)?.[1] ?? fixture.shownRunFailures;
  carry.stall = lastCall(writeStallState)?.[1] ?? carry.stall;
  carry.ciRetrigger = lastCall(writeCiRetrigger)?.[1] ?? carry.ciRetrigger;
  for (const [, sig] of vi.mocked(writeQueueRemovalFollowUp).mock.calls)
    carry.queueRemoval.add(sig);
  for (const [, sig] of vi.mocked(writeCiStartFollowUp).mock.calls) carry.ciStart.add(sig);
}

function installCarry(fixture, carry) {
  vi.mocked(loadSeenMap).mockResolvedValue(new Map(carry.seen));
  vi.mocked(readStallState).mockResolvedValue({ ok: true, state: carry.stall });
  vi.mocked(readCiRetrigger).mockResolvedValue(carry.ciRetrigger);
  vi.mocked(readQueueRemovalFollowUp).mockImplementation((_k, sig) =>
    Promise.resolve(carry.queueRemoval.has(sig)),
  );
  vi.mocked(readCiStartFollowUp).mockImplementation((_k, sig) =>
    Promise.resolve(carry.ciStart.has(sig)),
  );
}

async function tick(fixture, carry) {
  applyFixture(fixture);
  installCarry(fixture, carry);
  for (const writer of WRITERS) vi.mocked(writer).mockClear();
  const { out, exitCode } = await runMain([
    "iterate",
    String(fixture.batchData?.number ?? 42),
    ...(fixture.args ?? []),
    "--format=json",
  ]);
  absorbWrites(carry, fixture);
  return { ...JSON.parse(out), exitCode };
}

/** The content a looping caller would act on; identical content on the same head is a loop. */
export function actionableContent(result) {
  return JSON.stringify({ action: result.action, status: result.status, triage: result.triage });
}

/**
 * Runs up to MAX_TICKS no-op ticks. Returns the action of each tick and the 1-based index of the
 * first `triage` tick whose actionable content equals the previous one (0 when none).
 */
export async function runNoOpAgent(input) {
  const fixture = structuredClone(input);
  fixture.batchData = { ...fixture.batchData };
  const carry = newCarry(fixture);
  const actions = [];
  const ticks = [];
  let previous;
  for (let n = 1; n <= MAX_TICKS; n++) {
    const result = await tick(fixture, carry);
    actions.push(result.action);
    ticks.push(result);
    if (result.action !== "triage") return { actions, ticks, repeatedAt: 0 };
    const content = actionableContent(result);
    if (content === previous) return { actions, ticks, repeatedAt: n };
    previous = content;
    applyAgentEffects(fixture, result.triage, carry.seen);
  }
  return { actions, ticks, repeatedAt: 0 };
}
