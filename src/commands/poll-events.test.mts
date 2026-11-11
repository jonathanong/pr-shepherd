import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventTransport, TransportResult } from "../events/types.mts";

const state = vi.hoisted(() => ({
  config: { source: "hook-harness", "fallback-interval-seconds": 300 } as {
    source: string;
    "fallback-interval-seconds": number;
  },
}));
vi.mock("../config/load.mts", () => ({ loadConfig: () => ({ events: state.config }) }));
vi.mock("../events/config.mts", () => ({ resolveEventsSource: vi.fn() }));
vi.mock("../events/relay.mts", () => ({
  createRelayTransport: vi.fn(),
  RELAY_REQUEST_TIMEOUT_MS: 10_000,
}));
vi.mock("../events/serve.mts", () => ({ createServeTransport: vi.fn() }));
vi.mock("../github/github-fetch.mts", () => ({ githubFetch: vi.fn() }));
vi.mock("../log/log-file.mts", () => ({ appendEntry: vi.fn() }));
vi.mock("../util/sleep.mts", () => ({
  sleep: vi.fn(async (ms: number) => {
    vi.setSystemTime(Date.now() + ms);
  }),
}));

import { resolveEventsSource } from "../events/config.mts";
import { createRelayTransport } from "../events/relay.mts";
import { createServeTransport } from "../events/serve.mts";
import { githubFetch } from "../github/github-fetch.mts";
import { aggregateTargets, onePrTargets, withPollEvents, type PollEvents } from "./poll-events.mts";

let stderr: ReturnType<typeof vi.spyOn>;

function fakeTransport(results: TransportResult[]): EventTransport {
  return {
    intervalMs: 15_000,
    poll: vi.fn(async () => (results.length > 1 ? results.shift()! : results[0]!)),
    close: vi.fn(),
  };
}

async function enabled(results: TransportResult[], verbose = false): Promise<PollEvents> {
  vi.mocked(resolveEventsSource).mockReturnValue({ kind: "relay", url: "https://r", token: "t" });
  vi.mocked(createRelayTransport).mockReturnValue(fakeTransport(results));
  let events: PollEvents | undefined;
  await withPollEvents(verbose, async (value) => {
    events = value;
  });
  return events!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  state.config = { source: "hook-harness", "fallback-interval-seconds": 300 };
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.useRealTimers();
  stderr.mockRestore();
});

describe("withPollEvents", () => {
  it("passes undefined and resolves nothing when events.source is none", async () => {
    state.config = { source: "none", "fallback-interval-seconds": 300 };
    const run = vi.fn(async (events: PollEvents | undefined) => events);
    expect(await withPollEvents(false, run)).toBeUndefined();
    expect(resolveEventsSource).not.toHaveBeenCalled();
  });

  it("fails at startup when no source resolves", async () => {
    vi.mocked(resolveEventsSource).mockImplementation(() => {
      throw new Error("no login");
    });
    const run = vi.fn();
    await expect(withPollEvents(false, run)).rejects.toThrow("no login");
    expect(run).not.toHaveBeenCalled();
  });

  it("builds a relay transport that fetches through the proxy-aware client", async () => {
    await enabled([{ events: [] }]);
    const [source, startMs, deps] = vi.mocked(createRelayTransport).mock.calls[0]!;
    expect(source).toEqual({ kind: "relay", url: "https://r", token: "t" });
    expect(startMs).toBe(1_000_000);
    await deps.fetch("https://r/events", { method: "GET" });
    expect(githubFetch).toHaveBeenCalledWith("https://r/events", { method: "GET" }, 10_000);
  });

  it("builds a serve transport for HOOK_HARNESS_SOURCE", async () => {
    vi.mocked(resolveEventsSource).mockReturnValue({ kind: "serve", url: "http://l", token: "" });
    vi.mocked(createServeTransport).mockReturnValue(fakeTransport([{ events: [] }]));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x"));
    await withPollEvents(false, async () => {});
    const [, , deps] = vi.mocked(createServeTransport).mock.calls[0]!;
    await deps.fetch("http://l/events");
    expect(fetchSpy).toHaveBeenCalledWith("http://l/events", undefined);
    expect(createRelayTransport).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("closes the source when the run finishes or throws", async () => {
    const transport = fakeTransport([{ events: [] }]);
    vi.mocked(resolveEventsSource).mockReturnValue({ kind: "relay", url: "https://r", token: "t" });
    vi.mocked(createRelayTransport).mockReturnValue(transport);
    await withPollEvents(false, async () => {});
    await expect(
      withPollEvents(false, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(transport.close).toHaveBeenCalledTimes(2);
  });
});

describe("targets", () => {
  it("builds the single-PR target from the tick's head data", () => {
    expect(
      onePrTargets({ repo: "a/b", pr: 3, baseBranch: "main" }, { headSha: "s", headRef: "h" }),
    ).toEqual([{ repo: "a/b", pr: 3, baseRef: "main", headSha: "s", headRef: "h" }]);
    expect(onePrTargets({ repo: "a/b", pr: 3, baseBranch: "main" }, {})).toEqual([
      { repo: "a/b", pr: 3, baseRef: "main" },
    ]);
  });

  it("builds aggregate targets from open PRs only", () => {
    const row = (pr: number, state: string) => ({
      repo: "a/b",
      pr,
      state,
      headRefOid: `sha${pr}`,
      headRefName: `h${pr}`,
      baseRefName: "main",
    });
    expect(aggregateTargets({ prs: [row(1, "OPEN"), row(2, "MERGED")] } as never)).toEqual([
      { repo: "a/b", pr: 1, headSha: "sha1", headRef: "h1", baseRef: "main" },
    ]);
  });
});
