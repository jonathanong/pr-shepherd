import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("../commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("../commands/commit-suggestion.mts", () => ({ runCommitSuggestion: vi.fn() }));
vi.mock("../commands/iterate.mts", () => ({ runIterate: vi.fn() }));
vi.mock("../commands/monitor.mts", () => ({
  runMonitor: vi.fn(),
  formatMonitorResult: vi.fn(),
}));
vi.mock("../commands/status.mts", () => ({
  runStatus: vi.fn(),
  formatStatusTable: vi.fn(),
}));
vi.mock("../commands/log-file.mts", () => ({ runLogFile: vi.fn() }));
vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));
vi.mock("../reporters/text.mts", () => ({ formatText: vi.fn() }));
vi.mock("../cli/formatters.mts", () => ({
  formatFetchResult: vi.fn(),
  formatCommitSuggestionResult: vi.fn(),
  formatMutateResult: vi.fn(),
  formatIterateResult: vi.fn(),
}));
vi.mock("./tool-coerce.mts", async (importOriginal) => {
  return importOriginal();
});

import { runCheck } from "../commands/check.mts";
import { runResolveFetch, runResolveMutate } from "../commands/resolve.mts";
import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runIterate } from "../commands/iterate.mts";
import { runMonitor, formatMonitorResult } from "../commands/monitor.mts";
import { runStatus, formatStatusTable } from "../commands/status.mts";
import { runLogFile } from "../commands/log-file.mts";
import { formatText } from "../reporters/text.mts";
import {
  formatFetchResult,
  formatCommitSuggestionResult,
  formatMutateResult,
  formatIterateResult,
} from "../cli/formatters.mts";
import { SubscriptionStore } from "./subscriptions.mts";
import {
  handleCheck,
  handleResolveFetch,
  handleResolveMutate,
  handleCommitSuggestion,
  handleIterate,
  handleMonitor,
  handleStatus,
  handleLogFile,
  handleSubscribePr,
  handleUnsubscribePr,
  ok,
  err,
} from "./tool-handlers.mts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ok / err helpers", () => {
  it("ok wraps text in content array", () => {
    expect(ok("hello")).toEqual({ content: [{ type: "text", text: "hello" }] });
  });

  it("err sets isError and prefixes message", () => {
    const result = err("oops");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("Error: oops");
  });
});

describe("handleCheck", () => {
  it("calls runCheck and formats the report", async () => {
    const report = { pr: 1 };
    vi.mocked(runCheck).mockResolvedValue(report as never);
    vi.mocked(formatText).mockReturnValue("check output");

    const result = await handleCheck({ prNumber: 1 });
    expect(runCheck).toHaveBeenCalledWith({ format: "text", prNumber: 1, skipTriage: undefined });
    expect(result.content[0]!.text).toBe("check output");
  });

  it("works without prNumber", async () => {
    vi.mocked(runCheck).mockResolvedValue({} as never);
    vi.mocked(formatText).mockReturnValue("ok");
    await handleCheck({});
    expect(runCheck).toHaveBeenCalledWith({
      format: "text",
      prNumber: undefined,
      skipTriage: undefined,
    });
  });
});

describe("handleResolveFetch", () => {
  it("calls runResolveFetch and formats result", async () => {
    const result = { prNumber: 1 };
    vi.mocked(runResolveFetch).mockResolvedValue(result as never);
    vi.mocked(formatFetchResult).mockReturnValue("fetch output");

    const out = await handleResolveFetch({ prNumber: 1 });
    expect(out.content[0]!.text).toBe("fetch output");
  });
});

describe("handleResolveMutate", () => {
  it("calls runResolveMutate with all options", async () => {
    vi.mocked(runResolveMutate).mockResolvedValue({} as never);
    vi.mocked(formatMutateResult).mockReturnValue("mutate output");

    await handleResolveMutate({
      resolveThreadIds: ["t1"],
      minimizeCommentIds: ["c1"],
      dismissReviewIds: ["r1"],
      dismissMessage: "msg",
      requireSha: "abc",
    });
    expect(runResolveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        resolveThreadIds: ["t1"],
        minimizeCommentIds: ["c1"],
        dismissReviewIds: ["r1"],
        dismissMessage: "msg",
        requireSha: "abc",
      }),
    );
  });
});

describe("handleCommitSuggestion", () => {
  it("calls runCommitSuggestion with required threadId", async () => {
    vi.mocked(runCommitSuggestion).mockResolvedValue({} as never);
    vi.mocked(formatCommitSuggestionResult).mockReturnValue("cs output");

    const out = await handleCommitSuggestion({ threadId: "t1", message: "fix" });
    expect(runCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "t1", message: "fix" }),
    );
    expect(out.content[0]!.text).toBe("cs output");
  });

  it("throws when threadId missing", async () => {
    await expect(handleCommitSuggestion({})).rejects.toThrow("threadId");
  });
});

describe("handleIterate", () => {
  it("calls runIterate and formats result", async () => {
    vi.mocked(runIterate).mockResolvedValue({} as never);
    vi.mocked(formatIterateResult).mockReturnValue("iterate output");

    const out = await handleIterate({ cooldownSeconds: 10, noAutoMarkReady: true });
    expect(runIterate).toHaveBeenCalledWith(
      expect.objectContaining({ cooldownSeconds: 10, noAutoMarkReady: true }),
    );
    expect(out.content[0]!.text).toBe("iterate output");
  });
});

describe("handleMonitor", () => {
  it("calls runMonitor and formatMonitorResult", async () => {
    vi.mocked(runMonitor).mockResolvedValue({} as never);
    vi.mocked(formatMonitorResult).mockReturnValue("monitor output");

    const out = await handleMonitor({ readyDelaySuffix: "15m" });
    expect(out.content[0]!.text).toBe("monitor output");
  });
});

describe("handleStatus", () => {
  it("calls runStatus and formatStatusTable with repo", async () => {
    vi.mocked(runStatus).mockResolvedValue([]);
    vi.mocked(formatStatusTable).mockReturnValue("status output");

    const out = await handleStatus({ prNumbers: [1, 2] });
    expect(runStatus).toHaveBeenCalledWith(expect.objectContaining({ prNumbers: [1, 2] }));
    expect(formatStatusTable).toHaveBeenCalledWith([], "owner/repo");
    expect(out.content[0]!.text).toBe("status output");
  });

  it("throws when prNumbers missing", async () => {
    await expect(handleStatus({})).rejects.toThrow("prNumbers");
  });
});

describe("handleLogFile", () => {
  it("returns the log file path", async () => {
    vi.mocked(runLogFile).mockResolvedValue({ path: "/tmp/log.md" });
    const out = await handleLogFile();
    expect(out.content[0]!.text).toBe("/tmp/log.md");
  });
});

describe("handleSubscribePr / handleUnsubscribePr", () => {
  let subs: SubscriptionStore;

  beforeEach(() => {
    subs = new SubscriptionStore();
  });

  it("subscribes a PR and lists it", () => {
    const out = handleSubscribePr({ prNumber: 42 }, subs);
    expect(subs.isSubscribed(42)).toBe(true);
    expect(out.content[0]!.text).toContain("42");
  });

  it("throws when prNumber missing", () => {
    expect(() => handleSubscribePr({}, subs)).toThrow("prNumber");
  });

  it("unsubscribes a PR", () => {
    subs.subscribe(42);
    const out = handleUnsubscribePr({ prNumber: 42 }, subs);
    expect(subs.isSubscribed(42)).toBe(false);
    expect(out.content[0]!.text).toContain("(none)");
  });

  it("shows remaining PRs after unsubscribe", () => {
    subs.subscribe(1);
    subs.subscribe(2);
    const out = handleUnsubscribePr({ prNumber: 1 }, subs);
    expect(out.content[0]!.text).toContain("2");
  });
});
