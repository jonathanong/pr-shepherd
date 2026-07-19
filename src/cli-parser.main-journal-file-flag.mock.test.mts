import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { mockRunJournal } = vi.hoisted(() => ({ mockRunJournal: vi.fn() }));

vi.mock("./commands/journal/index.mts", () => ({ runJournal: mockRunJournal }));
vi.mock("./commands/resolve.mts", () => ({ runResolveMutate: vi.fn() }));
vi.mock("./commands/log-file.mts", () => ({ runLogFile: vi.fn() }));
vi.mock("./commands/commit-suggestion.mts", () => ({ runCommitSuggestion: vi.fn() }));
vi.mock("./commands/mark-files-as-viewed.mts", () => ({ runMarkFilesAsViewed: vi.fn() }));
vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";

const HAPPY_RESULT = { prNumber: 42, mutated: true, sectionExisted: false, dryRun: false };

let stderrSpy: ReturnType<typeof vi.spyOn>;

/** Swaps `process.stdin` for a fake async-iterable stream, returning a restore function. */
function mockStdin(content: string): () => void {
  const original = process.stdin;
  const fake = {
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(content, "utf8");
    },
  };
  Object.defineProperty(process, "stdin", { value: fake, configurable: true });
  return () => Object.defineProperty(process, "stdin", { value: original, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunJournal.mockResolvedValue(HAPPY_RESULT);
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("main — journal --file", () => {
  it("reads the entry from a file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-shepherd-journal-"));
    const filePath = join(dir, "entry.md");
    writeFileSync(filePath, "- Decision from file.\n");
    try {
      await main(["node", "shepherd", "journal", "42", "--file", filePath]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(mockRunJournal).toHaveBeenCalledWith(
      expect.objectContaining({ rawItem: "- Decision from file.\n" }),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("passes an empty file's content to runJournal instead of printing usage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-shepherd-journal-"));
    const filePath = join(dir, "empty.md");
    writeFileSync(filePath, "");
    try {
      await main(["node", "shepherd", "journal", "42", "--file", filePath]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(mockRunJournal).toHaveBeenCalledWith(expect.objectContaining({ rawItem: "" }));
    expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  it("accepts the --file=path form", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-shepherd-journal-"));
    const filePath = join(dir, "entry.md");
    writeFileSync(filePath, "- Decision via equals form.\n");
    try {
      await main(["node", "shepherd", "journal", "42", `--file=${filePath}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(mockRunJournal).toHaveBeenCalledWith(
      expect.objectContaining({ rawItem: "- Decision via equals form.\n" }),
    );
  });

  it("reads the entry from stdin when --file is -", async () => {
    const restore = mockStdin("- Decision from stdin with `backticks`.\n");
    try {
      await main(["node", "shepherd", "journal", "42", "--file", "-"]);
    } finally {
      restore();
    }
    expect(mockRunJournal).toHaveBeenCalledWith(
      expect.objectContaining({ rawItem: "- Decision from stdin with `backticks`.\n" }),
    );
  });

  it("errors when both a positional entry and --file are given", async () => {
    await main(["node", "shepherd", "journal", "42", "- Decision.", "--file", "somefile.md"]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("not both"));
    expect(process.exitCode).toBe(1);
    expect(mockRunJournal).not.toHaveBeenCalled();
  });

  it("sets exitCode=1 when the --file path does not exist", async () => {
    await main([
      "node",
      "shepherd",
      "journal",
      "42",
      "--file",
      "/nonexistent/pr-shepherd-entry.md",
    ]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("journal:"));
    expect(process.exitCode).toBe(1);
    expect(mockRunJournal).not.toHaveBeenCalled();
  });
});
