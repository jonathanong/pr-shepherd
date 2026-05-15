// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// Intercept path.resolve to simulate a target that resolves outside the state base.
const escapeResolve = vi.hoisted(() => {
  const state = { enabled: false, calls: 0 };
  return {
    enable() {
      state.enabled = true;
      state.calls = 0;
    },
    disable() {
      state.enabled = false;
      state.calls = 0;
    },
    isEnabled() {
      return state.enabled;
    },
    tick() {
      return state.calls++;
    },
  };
});

vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return {
    ...actual,
    resolve: (...args: string[]) => {
      if (escapeResolve.isEnabled()) {
        const n = escapeResolve.tick();
        if (n === 0) return "/tmp/evil-escaped";
        if (n === 1) return "/tmp/safe-base";
      }
      return actual.resolve(...args);
    },
  };
});

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "acme", name: "widgets" }),
  getCurrentBranch: vi.fn().mockResolvedValue("feature/test"),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getPrNumberForBranch: vi.fn().mockResolvedValue(42),
}));

import { runClean } from "./clean.mts";

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "shepherd-path-escape-test-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  escapeResolve.disable();
});

afterEach(async () => {
  escapeResolve.disable();
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("path escape guard", () => {
  it("errors when resolved target falls outside the state base", async () => {
    escapeResolve.enable();
    const result = await runClean({ variant: "repo" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Target path escapes state base/);
  });
});
