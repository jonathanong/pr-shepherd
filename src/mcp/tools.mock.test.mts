import { describe, it, expect, vi } from "vitest";

vi.mock("./tool-handlers.mts", () => ({
  handleCheck: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "check" }] }),
  handleResolveFetch: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "fetch" }] }),
  handleResolveMutate: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "mutate" }] }),
  handleCommitSuggestion: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "cs" }] }),
  handleIterate: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "iterate" }] }),
  handleMonitor: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "monitor" }] }),
  handleStatus: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "status" }] }),
  handleLogFile: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "/tmp/log.md" }] }),
  handleSubscribePr: vi.fn().mockReturnValue({ content: [{ type: "text", text: "subscribed" }] }),
  handleUnsubscribePr: vi
    .fn()
    .mockReturnValue({ content: [{ type: "text", text: "unsubscribed" }] }),
  err: vi.fn((msg: string) => ({
    content: [{ type: "text", text: `Error: ${msg}` }],
    isError: true,
  })),
}));

import { buildToolList, buildToolHandler } from "./tools.mts";
import { SubscriptionStore } from "./subscriptions.mts";

describe("buildToolList", () => {
  it("returns 10 tools", () => {
    expect(buildToolList()).toHaveLength(10);
  });

  it("includes all expected tool names", () => {
    const names = buildToolList().map((t) => t.name);
    expect(names).toContain("shepherd_check");
    expect(names).toContain("shepherd_resolve_fetch");
    expect(names).toContain("shepherd_resolve_mutate");
    expect(names).toContain("shepherd_commit_suggestion");
    expect(names).toContain("shepherd_iterate");
    expect(names).toContain("shepherd_monitor");
    expect(names).toContain("shepherd_status");
    expect(names).toContain("shepherd_log_file");
    expect(names).toContain("shepherd_subscribe_pr");
    expect(names).toContain("shepherd_unsubscribe_pr");
  });

  it("each tool has a name, description, and inputSchema", () => {
    for (const tool of buildToolList()) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
    }
  });
});

describe("buildToolHandler", () => {
  const deps = { subscriptions: new SubscriptionStore() };

  it("routes shepherd_check to handleCheck", async () => {
    const handler = buildToolHandler(deps);
    const result = await handler("shepherd_check", {});
    expect((result.content[0]! as { text: string }).text).toBe("check");
  });

  it("routes shepherd_resolve_fetch", async () => {
    const result = await buildToolHandler(deps)("shepherd_resolve_fetch", {});
    expect((result.content[0]! as { text: string }).text).toBe("fetch");
  });

  it("routes shepherd_resolve_mutate", async () => {
    const result = await buildToolHandler(deps)("shepherd_resolve_mutate", {});
    expect((result.content[0]! as { text: string }).text).toBe("mutate");
  });

  it("routes shepherd_commit_suggestion", async () => {
    const result = await buildToolHandler(deps)("shepherd_commit_suggestion", {});
    expect((result.content[0]! as { text: string }).text).toBe("cs");
  });

  it("routes shepherd_iterate", async () => {
    const result = await buildToolHandler(deps)("shepherd_iterate", {});
    expect((result.content[0]! as { text: string }).text).toBe("iterate");
  });

  it("routes shepherd_monitor", async () => {
    const result = await buildToolHandler(deps)("shepherd_monitor", {});
    expect((result.content[0]! as { text: string }).text).toBe("monitor");
  });

  it("routes shepherd_status", async () => {
    const result = await buildToolHandler(deps)("shepherd_status", {});
    expect((result.content[0]! as { text: string }).text).toBe("status");
  });

  it("routes shepherd_log_file", async () => {
    const result = await buildToolHandler(deps)("shepherd_log_file", {});
    expect((result.content[0]! as { text: string }).text).toBe("/tmp/log.md");
  });

  it("routes shepherd_subscribe_pr", async () => {
    const result = await buildToolHandler(deps)("shepherd_subscribe_pr", { prNumber: 1 });
    expect((result.content[0]! as { text: string }).text).toBe("subscribed");
  });

  it("routes shepherd_unsubscribe_pr", async () => {
    const result = await buildToolHandler(deps)("shepherd_unsubscribe_pr", { prNumber: 1 });
    expect((result.content[0]! as { text: string }).text).toBe("unsubscribed");
  });

  it("returns error for unknown tool", async () => {
    const result = await buildToolHandler(deps)("unknown_tool", {});
    expect(result.isError).toBe(true);
  });

  it("catches thrown errors and returns isError result", async () => {
    const { handleCheck } = await import("./tool-handlers.mts");
    vi.mocked(handleCheck).mockRejectedValueOnce(new Error("boom"));
    const result = await buildToolHandler(deps)("shepherd_check", {});
    expect(result.isError).toBe(true);
    expect((result.content[0]! as { text: string }).text).toContain("boom");
  });
});
