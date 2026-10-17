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

import { runIterateTick } from "./tick.mts";

const base = { repo: "owner/repo", pr: 42 };
const opts = { pr: 42, repo: { owner: "owner", repo: "repo" } } as never;

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadConfig.mockReturnValue({ iterate: { "stall-timeout-minutes": 60 } });
  m.readStallState.mockResolvedValue({ ok: true, state: null });
  vi.stubEnv("CLAUDE_CODE_REMOTE", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("merge ticks", () => {
  it("keeps a merge-pending wake-up only for a REST merge", async () => {
    m.runIterate.mockResolvedValueOnce({ action: "merge", merge: { mode: "rest" }, ...base });
    expect(await runIterateTick(opts)).toMatchObject({ nextCheck: { reason: "merge-pending" } });
    m.runIterate.mockResolvedValueOnce({ action: "merge", merge: { mode: "auto" }, ...base });
    expect(await runIterateTick(opts)).not.toHaveProperty("nextCheck");
  });
});
