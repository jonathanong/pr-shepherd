import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

const { mockSummarizeApiTelemetry, mockEvaluateQuotaWarning } = vi.hoisted(() => ({
  mockSummarizeApiTelemetry: vi.fn(),
  mockEvaluateQuotaWarning: vi.fn(),
}));
vi.mock("../github/api-telemetry.mts", () => ({
  withApiTelemetryScope: vi.fn((callback: () => unknown) => callback()),
  summarizeApiTelemetry: mockSummarizeApiTelemetry,
  withGraphqlCredentialFingerprint: <T,>(sample: T) => sample,
}));
vi.mock("../state/graphql-quota-warnings.mts", () => ({
  evaluateWorktreeGraphqlQuotaWarning: mockEvaluateQuotaWarning,
}));
vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn() }));

import { fetchPollSummary } from "../github/poll-summary.mts";
import { sleep } from "../util/sleep.mts";
import type { PollSummaryItem } from "../types.mts";
import { runAggregatePoll } from "./poll-summary.mts";

function waitingRow(): PollSummaryItem {
  return {
    pr: 42,
    repo: "acme/widgets",
    title: "PR 42",
    url: "https://github.com/acme/widgets/pull/42",
    action: "wait",
    reasons: ["pending-or-unknown"],
    state: "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    headRefName: "feature-42",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
  };
}

function terminalRow(): PollSummaryItem {
  return {
    ...waitingRow(),
    action: "cancel",
    reasons: ["merged"],
    state: "MERGED",
  };
}

beforeEach(() => vi.clearAllMocks());

it("returns an aggregate until-terminal wait when a quota warning is crossed", async () => {
  const quotaWarning = {
    resource: "graphql" as const,
    thresholdPercent: 20,
    remaining: 900,
    limit: 5_000,
    resetAt: 2_000_000_000,
    pollIntervalMinutes: 5,
    pollTimeoutMinutes: 15,
  };
  mockSummarizeApiTelemetry.mockReturnValue({
    credentialSources: ["gh"],
    graphql: {
      resource: "graphql",
      requestCount: 1,
      measuredQueryCost: 1,
      unmeasuredRequestCount: 0,
      nodeCount: 10,
      remaining: 900,
      limit: 5_000,
      resetAt: 2_000_000_000,
    },
  });
  mockEvaluateQuotaWarning.mockResolvedValue(quotaWarning);
  vi.mocked(fetchPollSummary).mockResolvedValue({
    selection: { kind: "prs", requested: [42] },
    prs: [waitingRow()],
  });

  await expect(
    runAggregatePoll({
      prNumbers: [42],
      targetRepository: { owner: "acme", name: "widgets" },
      intervalSeconds: 60,
      timeoutSeconds: 0,
      debounceSeconds: 0,
      untilTerminal: true,
    }),
  ).resolves.toMatchObject({ reason: "waiting", quotaWarning });
  expect(vi.mocked(sleep)).not.toHaveBeenCalled();
});

it("includes a quota warning crossed on the terminal tick", async () => {
  const quotaWarning = {
    resource: "graphql" as const,
    thresholdPercent: 20,
    remaining: 900,
    limit: 5_000,
    resetAt: 2_000_000_000,
    pollIntervalMinutes: 5,
    pollTimeoutMinutes: 15,
  };
  mockSummarizeApiTelemetry.mockReturnValue({
    graphql: {
      resource: "graphql",
      requestCount: 1,
      measuredQueryCost: 1,
      unmeasuredRequestCount: 0,
      nodeCount: 10,
      remaining: 900,
      limit: 5_000,
      resetAt: 2_000_000_000,
    },
  });
  mockEvaluateQuotaWarning.mockResolvedValue(quotaWarning);
  vi.mocked(fetchPollSummary).mockResolvedValue({
    selection: { kind: "prs", requested: [42] },
    prs: [terminalRow()],
  });

  await expect(
    runAggregatePoll({
      prNumbers: [42],
      targetRepository: { owner: "acme", name: "widgets" },
      intervalSeconds: 60,
      timeoutSeconds: 0,
      debounceSeconds: 0,
    }),
  ).resolves.toMatchObject({ reason: "all_terminal", quotaWarning });
});

it("does not add a second quota warning for a stale sample in the same window", async () => {
  const actual = await vi.importActual<typeof import("../state/graphql-quota-warnings.mts")>(
    "../state/graphql-quota-warnings.mts",
  );
  mockEvaluateQuotaWarning.mockImplementation(
    (...args: Parameters<typeof actual.evaluateWorktreeGraphqlQuotaWarning>) =>
      actual.evaluateWorktreeGraphqlQuotaWarning(...args),
  );
  const stateDir = await mkdtemp(join(tmpdir(), "pr-shepherd-quota-poll-"));
  const previousStateDir = process.env["PR_SHEPHERD_STATE_DIR"];
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  const usage = (used: number, remaining: number) => ({
    credentialSources: ["gh"],
    graphql: {
      resource: "graphql",
      requestCount: 1,
      measuredQueryCost: 1,
      unmeasuredRequestCount: 0,
      nodeCount: 1,
      limit: 5_000,
      used,
      remaining,
      resetAt: 1_700_000_000,
    },
  });
  const poll = {
    prNumbers: [42],
    targetRepository: { owner: "acme", name: "widgets" },
    intervalSeconds: 60,
    timeoutSeconds: 0,
    debounceSeconds: 0,
    untilTerminal: true,
  };
  try {
    mockSummarizeApiTelemetry.mockReturnValue(usage(3800, 1200));
    vi.mocked(fetchPollSummary).mockResolvedValue({
      selection: { kind: "prs", requested: [42] },
      prs: [waitingRow()],
    });
    await expect(runAggregatePoll(poll)).resolves.toMatchObject({
      quotaWarning: { thresholdPercent: 30 },
    });

    mockSummarizeApiTelemetry.mockReturnValue(usage(3790, 1210));
    vi.mocked(fetchPollSummary).mockResolvedValue({
      selection: { kind: "prs", requested: [42] },
      prs: [terminalRow()],
    });
    const second = await runAggregatePoll({ ...poll, untilTerminal: false });
    expect(second.quotaWarning).toBeUndefined();
    expect(second.reason).toBe("all_terminal");
  } finally {
    if (previousStateDir === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previousStateDir;
    await rm(stateDir, { recursive: true, force: true });
  }
});
