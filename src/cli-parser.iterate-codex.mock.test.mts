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
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";

const mockRunIterate = vi.mocked(runIterate);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

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

describe("main — iterate fix_code instruction rewriting", () => {
  it("rewrites wait instruction with unified recheck wording", async () => {
    process.env.AGENT = "codex";
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));

    await main(["node", "shepherd", "iterate", "42", "--ready-delay", "15m"]);
    const out = getStdout();
    expect(out).toContain(
      "1. Recheck: rerun `npx pr-shepherd 42 --ready-delay 15m` to continue the active goal once after a fresh 30s–4m delay.",
    );
  });

  it("rewrites mark_ready instruction with unified recheck wording", async () => {
    process.env.AGENT = "codex";
    mockRunIterate.mockResolvedValue(makeIterateResult("mark_ready"));

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain(
      "1. The CLI already marked the PR ready for review. Recheck: rerun `npx pr-shepherd 42` to recheck once after a fresh 30s–4m delay.",
    );
  });

  it("text rewrites stop instruction with unified recheck wording", async () => {
    process.env.AGENT = "codex";
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.instructions = [
      "If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.",
      "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42", "--ready-delay", "15m"]);
    const out = getStdout();
    expect(out).toContain(
      "2. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `npx pr-shepherd 42 --ready-delay 15m` to recheck once after a fresh 30s–4m delay.",
    );
  });

  it("json rewrites stop instruction", async () => {
    process.env.AGENT = "codex";
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.instructions = [
      "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42", "--format=json", "--ready-delay", "2h"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.fix.instructions).toEqual([
      "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `npx pr-shepherd 42 --ready-delay 2h` to recheck once after a fresh 30s–4m delay.",
    ]);
  });
});
