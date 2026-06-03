import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const HAPPY_RESULT = {
  prNumber: 42,
  mutated: true,
  sectionExisted: false,
  dryRun: false,
};

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunJournal.mockResolvedValue(HAPPY_RESULT);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe("main — journal text output", () => {
  it("prints created message when section did not exist", async () => {
    await main(["node", "shepherd", "journal", "42", "- Decision."]);
    expect(getStdout()).toContain("Created ## Shepherd Journal");
    expect(getStdout()).toContain("PR #42");
    expect(process.exitCode).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("prints appended message when section existed", async () => {
    mockRunJournal.mockResolvedValue({ ...HAPPY_RESULT, sectionExisted: true });
    await main(["node", "shepherd", "journal", "42", "- Decision."]);
    expect(getStdout()).toContain("Appended to ## Shepherd Journal");
  });

  it("prints no-change message when entry already present", async () => {
    mockRunJournal.mockResolvedValue({ ...HAPPY_RESULT, mutated: false, sectionExisted: true });
    await main(["node", "shepherd", "journal", "42", "- Decision."]);
    expect(getStdout()).toContain("No change");
    expect(getStdout()).toContain("already present");
  });

  it("prints dry-run message when --dry-run is passed", async () => {
    mockRunJournal.mockResolvedValue({
      ...HAPPY_RESULT,
      dryRun: true,
      previewBody: "## Shepherd Journal\n\n- Decision.",
    });
    await main(["node", "shepherd", "journal", "42", "- Decision.", "--dry-run"]);
    expect(getStdout()).toContain("Dry run");
    expect(getStdout()).toContain("## Shepherd Journal");
  });
});

describe("main — journal JSON output", () => {
  it("prints JSON for --format=json", async () => {
    await main(["node", "shepherd", "journal", "42", "- Decision.", "--format=json"]);
    const parsed = JSON.parse(getStdout());
    expect(parsed.prNumber).toBe(42);
    expect(parsed.mutated).toBe(true);
    expect(parsed.sectionExisted).toBe(false);
    expect(parsed.dryRun).toBe(false);
  });

  it("prints JSON for --format json", async () => {
    await main(["node", "shepherd", "journal", "42", "- Decision.", "--format", "json"]);
    const parsed = JSON.parse(getStdout());
    expect(parsed.prNumber).toBe(42);
  });
});

describe("main — journal --help", () => {
  it("prints usage for --help and exits 0", async () => {
    await main(["node", "shepherd", "journal", "--help"]);
    expect(getStdout()).toContain("Usage:");
    expect(getStdout()).toContain("--dry-run");
    expect(getStdout()).toContain("Shepherd Journal");
    expect(process.exitCode).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(mockRunJournal).not.toHaveBeenCalled();
  });

  it("prints usage for -h and exits 0", async () => {
    await main(["node", "shepherd", "journal", "-h"]);
    expect(getStdout()).toContain("Usage:");
    expect(process.exitCode).toBeUndefined();
  });
});

describe("main — journal error handling", () => {
  it("rejects unknown flags and sets exitCode=1", async () => {
    await main(["node", "shepherd", "journal", "42", "- Decision.", "--unknown-flag"]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown flag"));
    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode=1 and writes error when runJournal throws", async () => {
    mockRunJournal.mockRejectedValue(new Error('must start with "- <text>"'));
    await main(["node", "shepherd", "journal", "42", "Not a list item."]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("journal:"));
    expect(process.exitCode).toBe(1);
  });

  it("prints usage and sets exitCode=1 when item is missing", async () => {
    await main(["node", "shepherd", "journal", "42"]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(process.exitCode).toBe(1);
    expect(mockRunJournal).not.toHaveBeenCalled();
  });
});
