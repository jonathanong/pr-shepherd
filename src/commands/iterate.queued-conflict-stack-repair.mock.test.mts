import { describe, expect, it, vi } from "vitest";

const { mockFindStale } = vi.hoisted(() => ({
  mockFindStale: vi.fn(
    async (_report: unknown, _repo: unknown): Promise<{ instructions: string[] } | null> => null,
  ),
}));
vi.mock("./iterate/stale-ancestry.mts", () => ({
  findStaleNativeStackAncestry: (report: unknown, repo: unknown) => mockFindStale(report, repo),
}));

import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — stack repair on a queued conflict", () => {
  it("places stack repairs after the dequeue-or-wait choice as path (a)", async () => {
    mockFindStale.mockResolvedValue({ instructions: ["REPAIR the stack and push."] });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN",
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
        mergeQueue: { enabled: true, inQueue: true },
      }),
    );

    const result = await runIterate(makeOpts());

    if (result.action !== "triage") throw new Error(`expected triage, got ${result.action}`);
    const steps = result.triage.instructions;
    const choice = steps.findIndex((step) => step.includes("Choose one path"));
    expect(choice).toBeGreaterThanOrEqual(0);
    expect(steps[choice + 1]).toBe("If you chose (a): REPAIR the stack and push.");
    expect(steps.filter((step) => step.includes("REPAIR"))).toHaveLength(1);
  });
});
