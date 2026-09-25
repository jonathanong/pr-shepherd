import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../exit-codes.mts";
import { readCheckBlockers } from "../state/check-blockers.mts";

const { mockGetRepoInfo, mockGetCurrentPrNumber } = vi.hoisted(() => ({
  mockGetRepoInfo: vi.fn(),
  mockGetCurrentPrNumber: vi.fn(),
}));
vi.mock("../github/client.mts", () => ({
  getRepoInfo: mockGetRepoInfo,
  getCurrentPrNumber: mockGetCurrentPrNumber,
}));

import { main } from "../cli-parser.mts";
import { handleCheckBlocker } from "./check-blocker-handler.mts";

const key = { owner: "acme", repo: "widgets", pr: 42 };
let stateDir: string;
let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "pr-shepherd-blocker-cli-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  process.exitCode = undefined;
  mockGetRepoInfo.mockResolvedValue({ owner: "acme", name: "widgets" });
  mockGetCurrentPrNumber.mockResolvedValue(42);
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
  stdout.mockRestore();
  stderr.mockRestore();
});

function out(): string {
  return stdout.mock.calls.map((call: unknown[]) => String(call[0])).join("");
}

describe("apply check-blocker", () => {
  it("routes the apply subcommand from the CLI entrypoint", async () => {
    await main([
      "node",
      "pr-shepherd",
      "apply",
      "check-blocker",
      "42",
      "--check",
      "lint",
      "--blocked-by",
      "acme/widgets#9",
    ]);
    const stored = await readCheckBlockers(key);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      checkName: "lint",
      blocker: { owner: "acme", name: "widgets", number: 9, kind: "pull" },
    });
  });

  it("prints help before any repository lookup", async () => {
    await handleCheckBlocker(["--help"]);
    expect(out()).toContain("issue:owner/repo#N");
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    ["https://github.com/acme/widgets/pull/9", "pull"],
    ["https://github.com/acme/widgets/issues/9", "issue"],
    ["acme/widgets#9", "pull"],
    ["issue:acme/widgets#9", "issue"],
  ])("stores %s", async (ref, kind) => {
    await handleCheckBlocker(["42", "--check", "backend-tests (1)", "--blocked-by", ref]);
    const stored = await readCheckBlockers(key);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.blocker).toMatchObject({ owner: "acme", name: "widgets", number: 9, kind });
    expect(out()).toContain(`blocker.kind: ${kind}`);
    expect(out()).toContain("checkName: backend-tests (1)");
    expect(process.exitCode).toBeUndefined();
  });

  it("prints the same fields as JSON and does not write a rejected ref", async () => {
    await handleCheckBlocker([
      "https://github.com/acme/widgets/pull/42",
      "--check",
      "backend-tests (1)",
      "--blocked-by",
      "acme/widgets#9",
      "--format=json",
    ]);
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    const body = JSON.parse(out()) as { checkName: string; blocker: { kind: string } };
    expect(body).toMatchObject({
      checkName: "backend-tests (1)",
      blocker: { owner: "acme", name: "widgets", number: 9, kind: "pull" },
    });
    expect(body).toHaveProperty("recordedAt");
    await handleCheckBlocker(["42", "--check", "lint", "--blocked-by", "nope"]);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(stderr.mock.calls.map((call: unknown[]) => String(call[0])).join("")).toContain(
      "invalid",
    );
    expect(await readCheckBlockers(key)).toHaveLength(1);
  });

  it("clears one check and leaves the other", async () => {
    await handleCheckBlocker([
      "42",
      "--check",
      "backend-tests (1)",
      "--blocked-by",
      "acme/widgets#9",
    ]);
    await handleCheckBlocker(["42", "--check", "lint", "--blocked-by", "issue:acme/widgets#10"]);
    stdout.mockClear();
    await handleCheckBlocker(["42", "--check", "lint", "--clear", "--format", "json"]);
    expect(JSON.parse(out())).toEqual({ checkName: "lint" });
    expect(await readCheckBlockers(key)).toEqual([
      expect.objectContaining({ checkName: "backend-tests (1)" }),
    ]);
  });

  it.each([
    ["--check", "backend-tests (1)", "--blocked-by", "acme/widgets#9", "--clear"],
    ["--blocked-by", "acme/widgets#9"],
    ["--check"],
    ["42", "extra", "--check", "lint", "--blocked-by", "acme/widgets#9"],
    ["--check", "lint", "--unknown", "x"],
    ["--check", "lint"],
  ])("rejects %j without writing", async (...args) => {
    await handleCheckBlocker(args);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(await readCheckBlockers(key)).toEqual([]);
  });

  it("reports a missing PR and an unwritable state directory", async () => {
    mockGetCurrentPrNumber.mockResolvedValue(null);
    await handleCheckBlocker(["--check", "lint", "--blocked-by", "acme/widgets#9"]);
    expect(process.exitCode).toBe(EXIT.UNAVAILABLE);
    const blocker = join(stateDir, "file");
    await writeFile(blocker, "x", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    process.exitCode = undefined;
    await handleCheckBlocker(["42", "--check", "lint", "--blocked-by", "acme/widgets#9"]);
    expect(process.exitCode).toBe(EXIT.UNAVAILABLE);
    process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
    process.exitCode = undefined;
    await handleCheckBlocker(["42", "--check", "lint", "--blocked-by", "acme/widgets#9"]);
    await chmod(join(stateDir, "acme", "widgets", "42"), 0o555);
    await handleCheckBlocker(["42", "--check", "lint", "--clear"]);
    expect(process.exitCode).toBe(EXIT.UNAVAILABLE);
    await chmod(join(stateDir, "acme", "widgets", "42"), 0o755);
  });
});
