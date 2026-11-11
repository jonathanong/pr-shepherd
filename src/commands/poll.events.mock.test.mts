import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IterateResult } from "../types.mts";
import type { EventTransport, TransportResult } from "../events/types.mts";

vi.mock("./iterate/index.mts", () => ({ runIterate: vi.fn() }));
vi.mock("../config/load.mts", () => ({
  loadConfig: () => ({
    quotaWarningBands: [],
    events: { source: "hook-harness", "fallback-interval-seconds": 300 },
  }),
}));
vi.mock("../events/config.mts", () => ({
  resolveEventsSource: vi.fn(() => ({ kind: "relay", url: "https://r", token: "t" })),
}));
vi.mock("../events/relay.mts", () => ({
  createRelayTransport: vi.fn(),
  RELAY_REQUEST_TIMEOUT_MS: 10_000,
}));
vi.mock("../log/log-file.mts", () => ({ appendEntry: vi.fn() }));

import { createRelayTransport } from "../events/relay.mts";
import { runIterate } from "./iterate/index.mts";
import { runPoll } from "./poll.mts";

const mockRunIterate = vi.mocked(runIterate);
const result = (action: string, extra: object = {}): IterateResult =>
  ({
    action,
    pr: 42,
    repo: "acme/widgets",
    baseBranch: "main",
    mergeStateStatus: "BLOCKED",
    state: "OPEN",
    log: "WAIT: waiting",
    inProgressChecks: [],
    ...extra,
  }) as unknown as IterateResult;

let transport: EventTransport;
let polls: TransportResult[];
let stderr: ReturnType<typeof vi.spyOn>;

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
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.useRealTimers();
  stderr.mockRestore();
});

const base = { prNumber: 42, format: "json", intervalSeconds: 60, timeoutSeconds: 300 } as const;

describe("runPoll with hook-harness events", () => {
  it("wakes on an event matched by the head SHA the tick read, then ticks again", async () => {
    mockRunIterate.mockImplementationOnce(async (opts) => {
      opts.eventTargetSink!.headSha = "abc123";
      opts.eventTargetSink!.headRef = "feature";
      return result("wait");
    });
    mockRunIterate.mockResolvedValue(result("cancel", { state: "MERGED" }));
    polls = [
      {
        events: [
          {
            id: "x",
            event: "check_suite",
            repo: "acme/widgets",
            prs: [],
            headSha: "abc123",
            headRef: null,
            baseRef: null,
          },
        ],
      },
    ];
    const done = runPoll({ ...base, verbose: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await done).action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(mockRunIterate.mock.calls[0]![0].eventTargetSink).toBeDefined();
    expect(vi.mocked(createRelayTransport).mock.calls[0]![1]).toBeTypeOf("number");
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("— waiting for an event\n"));
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("woke on check_suite acme/widgets"),
    );
    expect(transport.close).toHaveBeenCalledOnce();
  });

  it("waits out a short window for events instead of giving up early, then returns the last wait", async () => {
    mockRunIterate.mockResolvedValue(result("wait"));
    const done = runPoll({ ...base, timeoutSeconds: 100 });
    await vi.advanceTimersByTimeAsync(100_000);
    expect((await done).action).toBe("wait");
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(transport.close).toHaveBeenCalledOnce();
  });

  it("uses events for a swallowed mark_ready under --merge", async () => {
    mockRunIterate
      .mockResolvedValueOnce(result("mark_ready"))
      .mockResolvedValue(result("cancel", { state: "MERGED" }));
    polls = [
      {
        events: [
          {
            id: "y",
            event: "pull_request",
            repo: "acme/widgets",
            prs: [42],
            headSha: null,
            headRef: null,
            baseRef: null,
          },
        ],
      },
    ];
    const done = runPoll({ ...base, merge: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await done).action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });

  it("falls back to the plain interval when the source is unhealthy", async () => {
    mockRunIterate
      .mockResolvedValueOnce(result("wait"))
      .mockResolvedValue(result("cancel", { state: "MERGED" }));
    polls = [{ events: [], unhealthy: "relay answered HTTP 503" }];
    const done = runPoll(base);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await done).action).toBe("cancel");
  });
});
