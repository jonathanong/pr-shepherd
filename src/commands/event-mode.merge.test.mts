import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  runIterate: vi.fn(),
  readStallState: vi.fn(),
  loadConfig: vi.fn(),
}));
vi.mock("./iterate/index.mts", () => ({ runIterate: m.runIterate }));
vi.mock("../state/iterate-stall.mts", () => ({ readStallState: m.readStallState }));
vi.mock("../config/load.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/load.mts")>()),
  loadConfig: m.loadConfig,
}));

import { runIterateForMode } from "./event-mode.mts";

const base = { repo: "owner/repo", pr: 42 };
const opts = { pr: 42, repo: { owner: "owner", repo: "repo" } } as never;

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadConfig.mockReturnValue({ poll: { mode: "event" }, iterate: { stallTimeoutMinutes: 60 } });
  m.readStallState.mockResolvedValue({ ok: true, state: null });
  vi.stubEnv("CLAUDE_CODE_REMOTE", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("event-mode merge ticks", () => {
  it("keeps a merge-pending wake-up only for a REST merge", async () => {
    m.runIterate.mockResolvedValueOnce({ action: "merge", merge: { mode: "rest" }, ...base });
    expect(await runIterateForMode(opts)).toMatchObject({ nextCheck: { reason: "merge-pending" } });
    m.runIterate.mockResolvedValueOnce({ action: "merge", merge: { mode: "auto" }, ...base });
    expect(await runIterateForMode(opts)).not.toHaveProperty("nextCheck");
  });
});
