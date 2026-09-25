import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/api-telemetry.mts", () => ({
  withApiTelemetryScope: vi.fn((callback: () => unknown) => callback()),
  summarizeApiTelemetry: vi.fn(() => undefined),
  withGraphqlCredentialFingerprint: <T,>(sample: T) => sample,
}));
vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn() }));

import { row } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { loadConfig } from "../config/load.mts";
import { fetchPollSummary } from "../github/poll-summary.mts";
import { sleep } from "../util/sleep.mts";
import { runAggregatePoll, runPollSummary } from "./poll-summary.mts";

const mockFetch = vi.mocked(fetchPollSummary);
const mockSleep = vi.mocked(sleep);
const opts = { stackPrNumber: 2, targetRepository: { owner: "acme", name: "widgets" } };
let stateDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  stateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-stack-stall-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  mockSleep.mockImplementation(async (ms) => {
    vi.setSystemTime(Date.now() + ms);
  });
  // Stack #9: both drafts wait on CI, so the selector can only wait.
  mockFetch.mockResolvedValue({
    selection: { kind: "stack", anchor: 2, stackNumber: 9, stackSize: 2 },
    prs: [1, 2].map((pr) =>
      row(pr, pr, {
        isDraft: true,
        action: "wait",
        reasons: ["pending-or-unknown"],
        pollCommand: `pr-shepherd https://github.com/acme/widgets/pull/${pr} --timeout 1s`,
        pollProbe: true,
      }),
    ),
  });
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("aggregate stack stall guard", () => {
  it("ends an until-terminal idle stack wait with stall-timeout", async () => {
    const result = await runAggregatePoll({
      ...opts,
      intervalSeconds: 60,
      timeoutSeconds: 0,
      untilTerminal: true,
      stallTimeoutSeconds: 180,
    });
    expect(result).toMatchObject({ nextAction: "escalate", reason: "actionable" });
    expect(result.instructions?.[0]).toContain("`stall-timeout`: the stack has not changed for 3");
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("keeps the configured timer across separate one-shot summaries", async () => {
    await expect(runPollSummary(opts)).resolves.toMatchObject({ nextAction: "wait" });
    vi.setSystemTime(Date.now() + loadConfig().iterate.stallTimeoutMinutes * 60 * 1000);
    const result = await runPollSummary(opts);
    expect(result.nextAction).toBe("escalate");
    expect(result.instructions?.[0]).toContain(
      "PR #1 (pending-or-unknown); PR #2 (pending-or-unknown)",
    );
  });
});
