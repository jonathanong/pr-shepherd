import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventTransport, TransportResult } from "../events/types.mts";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/api-telemetry.mts", () => ({
  withApiTelemetryScope: vi.fn((callback: () => unknown) => callback()),
  summarizeApiTelemetry: vi.fn(() => undefined),
  withGraphqlCredentialFingerprint: <T,>(sample: T) => sample,
  withRestCoreCredentialFingerprint: <T,>(sample: T) => sample,
}));
vi.mock("../config/load.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/load.mts")>();
  return {
    ...actual,
    loadConfig: () => ({
      ...actual.loadConfig(),
      events: { source: "hook-harness", "fallback-interval-seconds": 300 },
    }),
  };
});
vi.mock("../events/config.mts", () => ({
  resolveEventsSource: vi.fn(() => ({ kind: "relay", url: "https://r", token: "t" })),
}));
vi.mock("../events/relay.mts", () => ({
  createRelayTransport: vi.fn(),
  RELAY_REQUEST_TIMEOUT_MS: 10_000,
}));
vi.mock("../log/log-file.mts", () => ({ appendEntry: vi.fn() }));

import { row } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { createRelayTransport } from "../events/relay.mts";
import { fetchPollSummary } from "../github/poll-summary.mts";
import { runAggregatePoll } from "./poll-summary.mts";

const mockFetch = vi.mocked(fetchPollSummary);
const opts = { prNumbers: [1, 2], targetRepository: { owner: "acme", name: "widgets" } };
let transport: EventTransport;
let polls: TransportResult[];

const summary = (action: "wait" | "cancel") => ({
  selection: { kind: "prs" as const, requested: [1, 2] },
  prs: [1, 2].map((pr) =>
    row(pr, pr, {
      action,
      state: action === "cancel" ? "MERGED" : "OPEN",
      mergeStateStatus: "UNKNOWN",
    }),
  ),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  polls = [{ events: [] }];
  transport = {
    intervalMs: 15_000,
    poll: vi.fn(async () => (polls.length > 1 ? polls.shift()! : polls[0]!)),
    close: vi.fn(),
  };
  vi.mocked(createRelayTransport).mockReturnValue(transport);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runAggregatePoll with hook-harness events", () => {
  it("wakes on an event for any watched PR and ticks again", async () => {
    mockFetch
      .mockResolvedValueOnce(summary("wait") as never)
      .mockResolvedValue(summary("cancel") as never);
    polls = [
      {
        events: [
          {
            id: "e",
            event: "check_suite",
            repo: "acme/widgets",
            prs: [2],
            headSha: null,
            headRef: null,
            baseRef: null,
          },
        ],
      },
    ];
    const done = runAggregatePoll({
      ...opts,
      intervalSeconds: 120,
      timeoutSeconds: 600,
      verbose: true,
    });
    await vi.advanceTimersByTimeAsync(240_000);
    expect((await done).reason).toBe("all_terminal");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(transport.close).toHaveBeenCalledOnce();
  });

  it("times out at the window end without an event, keeping the UNKNOWN recheck cadence", async () => {
    mockFetch.mockResolvedValue(summary("wait") as never);
    const done = runAggregatePoll({ ...opts, intervalSeconds: 120, timeoutSeconds: 200 });
    await vi.advanceTimersByTimeAsync(200_000);
    expect((await done).reason).toBe("timeout");
    // UNKNOWN mergeability caps the wait at the plain 120s, so a second tick runs.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not use events during the debounce settle window", async () => {
    mockFetch.mockResolvedValue({
      selection: { kind: "prs" as const, requested: [1] },
      prs: [row(1, 1, { action: "triage", state: "OPEN" })],
    } as never);
    const done = runAggregatePoll({
      ...opts,
      intervalSeconds: 60,
      timeoutSeconds: 600,
      debounceSeconds: 60,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await done).reason).toBe("actionable");
    expect(transport.poll).not.toHaveBeenCalled();
  });

  it("caps the event wait at a ready-delay deadline, but not below the plain interval", async () => {
    const waiting = (remainingSeconds: number) =>
      ({
        selection: { kind: "prs" as const, requested: [1, 2] },
        prs: [1, 2].map((pr) =>
          row(pr, pr, {
            action: "wait",
            state: "OPEN",
            mergeStateStatus: "BLOCKED",
            remainingSeconds,
          }),
        ),
      }) as never;
    mockFetch
      .mockResolvedValueOnce(waiting(100))
      .mockResolvedValueOnce(waiting(10))
      .mockResolvedValue(summary("cancel") as never);
    const done = runAggregatePoll({ ...opts, intervalSeconds: 60, timeoutSeconds: 1000 });
    await vi.advanceTimersByTimeAsync(100_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await done).reason).toBe("all_terminal");
  });
});
