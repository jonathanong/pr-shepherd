import { vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("../src/commands/resolve.mts", () => ({
  runResolveMutate: vi.fn(),
}));
vi.mock("../src/commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("../src/commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});

import { main } from "../src/cli-parser.mts";
import { runIterate } from "../src/commands/iterate/index.mts";
import { formatIterateResult } from "../src/cli/iterate-formatter.mts";
import type { CancelReason, IterateResult } from "../src/types.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";

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
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    process.exitCode = undefined;
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
  runIterate,
  stderrSpy,
  stdoutSpy,
};
export type { CancelReason, IterateResult };
