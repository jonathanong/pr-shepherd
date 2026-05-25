import { readFileSync } from "node:fs";

import { vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/commands/resolve.mts", () => ({
  runResolveMutate: vi.fn(),
}));
vi.mock("../src/commands/log-file.mts", () => ({
  runLogFile: vi.fn(),
}));
vi.mock("../src/commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("../src/commands/mark-files-as-viewed.mts", () => ({
  runMarkFilesAsViewed: vi.fn(),
}));
vi.mock("../src/commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
import { main } from "../src/cli-parser.mts";
import { runLogFile } from "../src/commands/log-file.mts";
import { runResolveMutate } from "../src/commands/resolve.mts";
import { runMarkFilesAsViewed } from "../src/commands/mark-files-as-viewed.mts";

const mockRunResolveMutate = vi.mocked(runResolveMutate);
const mockRunLogFile = vi.mocked(runLogFile);
const mockRunMarkFilesAsViewed = vi.mocked(runMarkFilesAsViewed);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
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

export {
  getStdout,
  main,
  mockRunLogFile,
  mockRunMarkFilesAsViewed,
  mockRunResolveMutate,
  readFileSync,
  runLogFile,
  runResolveMutate,
  stderrSpy,
  stdoutSpy,
};
