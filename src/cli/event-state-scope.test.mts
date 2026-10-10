import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({ loadConfig: vi.fn() }));
vi.mock("../config/load.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/load.mts")>()),
  loadConfig: m.loadConfig,
}));

import { runInEventStateScope } from "./event-state-scope.mts";
import { durableStateRequested } from "../state/durable-state.mts";

function scoped(args: string[]): Promise<boolean> {
  return runInEventStateScope(args, async () => durableStateRequested());
}

beforeEach(() => {
  vi.stubEnv("CLAUDE_CODE_REMOTE", "");
  m.loadConfig.mockReset();
  m.loadConfig.mockReturnValue({ poll: { mode: "auto" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runInEventStateScope", () => {
  it("enters the durable scope for an explicit event-mode poll, iterate, or default poll", async () => {
    expect(await scoped(["42", "--poll-mode", "event"])).toBe(true);
    expect(await scoped(["iterate", "42", "--poll-mode=event"])).toBe(true);
    expect(await scoped(["poll", "--stack", "42", "--poll-mode", "event"])).toBe(true);
  });

  it("enters the durable scope when config selects event mode", async () => {
    m.loadConfig.mockReturnValue({ poll: { mode: "event" } });
    expect(await scoped(["42"])).toBe(true);
    expect(await scoped(["42", "--poll-mode", "poll"])).toBe(false);
  });

  it("stays unscoped for poll mode, other subcommands, invalid flags, and bad config", async () => {
    expect(await scoped(["42"])).toBe(false);
    expect(await scoped(["apply", "review", "42", "--poll-mode", "event"])).toBe(false);
    expect(await scoped(["42", "--poll-mode", "bogus"])).toBe(false);
    m.loadConfig.mockImplementation(() => {
      throw new Error("Invalid config");
    });
    expect(await scoped(["iterate", "42", "--poll-mode", "event"])).toBe(false);
  });
});
