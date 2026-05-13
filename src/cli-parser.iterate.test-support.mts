// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});

import { main } from "./cli-parser.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { formatIterateResult } from "./cli/iterate-formatter.mts";
import type { CancelReason, IterateResult } from "./types.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";

const mockRunIterate = vi.mocked(runIterate);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

function getStderr(): string {
  return stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

// ---------------------------------------------------------------------------
// iterate dispatch
// ---------------------------------------------------------------------------

export function registerHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    delete process.env.AGENT;
    delete process.env.CODEX_CI;
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    process.exitCode = undefined;
    delete process.env.AGENT;
    delete process.env.CODEX_CI;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
}

export {
  formatIterateResult,
  getStderr,
  getStdout,
  main,
  makeIterateResult,
  mockRunIterate,
  registerHooks,
  runIterate,
  stderrSpy,
  stdoutSpy,
};
export type { CancelReason, IterateResult };
