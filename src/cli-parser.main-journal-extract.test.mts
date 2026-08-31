import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const { mockSetupLog } = vi.hoisted(() => ({ mockSetupLog: vi.fn() }));

vi.mock("./log/setup.mts", () => ({ setupLog: mockSetupLog }));

import { main } from "./cli-parser.mts";
import { EXIT } from "./exit-codes.mts";

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function stdout(): string {
  return stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("");
}

function stderr(): string {
  return stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("main — journal extract", () => {
  it("prints exactly one typed JSON line without initializing Shepherd logging", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pr-shepherd-journal-extract-"));
    const bodyFile = join(directory, "body.md");
    writeFileSync(
      bodyFile,
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Kept.\n</details>\n",
    );
    try {
      await main(["node", "shepherd", "journal", "extract", "--body-file", bodyFile]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(stdout()).toBe('{"journal":{"entries":["- Kept."],"format":"details"},"ok":true}\n');
    expect(stderr()).toBe("");
    expect(process.exitCode).toBeUndefined();
    expect(mockSetupLog).not.toHaveBeenCalled();
  });

  it("returns malformed journal data as JSON without failing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pr-shepherd-journal-extract-"));
    const bodyFile = join(directory, "body.md");
    writeFileSync(
      bodyFile,
      "<details>\n<summary>Shepherd Journal</summary>\n\nNarrative.\n</details>\n",
    );
    try {
      await main(["node", "shepherd", "journal", "extract", `--body-file=${bodyFile}`]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(JSON.parse(stdout())).toMatchObject({ ok: false });
    expect(process.exitCode).toBeUndefined();
    expect(mockSetupLog).not.toHaveBeenCalled();
  });

  it.each([
    ["missing flag", []],
    ["missing path", ["--body-file"]],
    ["unknown flag", ["--unexpected"]],
    ["positional argument", ["body.md"]],
    ["duplicate path", ["--body-file", "one.md", "--body-file", "two.md"]],
  ])("rejects %s with usage", async (_name, args) => {
    await main(["node", "shepherd", "journal", "extract", ...args]);
    expect(stdout()).toBe("");
    expect(stderr()).toContain("Usage:");
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockSetupLog).not.toHaveBeenCalled();
  });

  it("prints nested help before any logging or file access", async () => {
    await main(["node", "shepherd", "journal", "extract", "--help"]);
    expect(stdout()).toContain("journal extract --body-file <path>");
    expect(stderr()).toBe("");
    expect(process.exitCode).toBeUndefined();
    expect(mockSetupLog).not.toHaveBeenCalled();
  });

  it("rejects unsafe input paths without exposing their content", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pr-shepherd-journal-extract-"));
    const target = join(directory, "target.md");
    const link = join(directory, "body-link.md");
    const fifo = join(directory, "body.fifo");
    const secret = "private body content must not be printed";
    writeFileSync(target, secret);
    try {
      const unsafePaths = [directory, join(directory, "missing.md")];
      if (process.platform !== "win32") {
        symlinkSync(target, link);
        execFileSync("mkfifo", [fifo]);
        unsafePaths.push(link, fifo, "/dev/null");
      }
      for (const bodyFile of unsafePaths) {
        await main(["node", "shepherd", "journal", "extract", "--body-file", bodyFile]);
        expect(stdout()).toBe("");
        expect(stderr()).toContain("body file could not be read safely");
        expect(stderr()).not.toContain(secret);
        expect(process.exitCode).toBe(EXIT.NOINPUT);
        expect(mockSetupLog).not.toHaveBeenCalled();
        stdoutSpy.mockClear();
        stderrSpy.mockClear();
        process.exitCode = undefined;
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
