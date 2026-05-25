import { vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/commands/clean.mts", () => ({
  runClean: vi.fn(),
}));
vi.mock("../src/commands/resolve.mts", () => ({
  runResolveMutate: vi.fn(),
}));
vi.mock("../src/commands/log-file.mts", () => ({
  runLogFile: vi.fn(),
}));
vi.mock("../src/commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("../src/commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});

import { main } from "../src/cli-parser.mts";
import { runClean } from "../src/commands/clean.mts";

export const mockRunClean = vi.mocked(runClean);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

export function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

export function getStderr(): string {
  return stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

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

export { main, stderrSpy, stdoutSpy };
