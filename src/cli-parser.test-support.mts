import { readFileSync } from "node:fs";

import { vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/log-file.mts", () => ({
  runLogFile: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("./commands/mark-files-as-viewed.mts", () => ({
  runMarkFilesAsViewed: vi.fn(),
}));
vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
import { main } from "./cli-parser.mts";
import { runLogFile } from "./commands/log-file.mts";
import { runResolveFetch, runResolveMutate } from "./commands/resolve.mts";
import { runMarkFilesAsViewed } from "./commands/mark-files-as-viewed.mts";

const mockRunResolveFetch = vi.mocked(runResolveFetch);
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
  mockRunResolveFetch,
  mockRunResolveMutate,
  readFileSync,
  runLogFile,
  runResolveFetch,
  runResolveMutate,
  stderrSpy,
  stdoutSpy,
};
