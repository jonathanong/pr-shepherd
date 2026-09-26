import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockFindStale } = vi.hoisted(() => ({
  mockFindStale: vi.fn(
    async (_report: unknown, _repo: unknown): Promise<{ instructions: string[] } | null> => null,
  ),
}));
vi.mock("./iterate/stale-ancestry.mts", () => ({
  findStaleNativeStackAncestry: (report: unknown, repo: unknown) => mockFindStale(report, repo),
}));

import { formatIterateResult } from "../cli/iterate-formatter.mts";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — unreported required checks", () => {
  let dir: string;
  let previous: string | undefined;

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("returns fix_code when required checks never started", async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-unreported-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
    mockFindStale.mockResolvedValue(null);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        headSha: "a".repeat(40),
        unreportedRequiredChecks: ["build", "tests"],
        trunkBehindBy: 2,
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") throw new Error("expected fix_code");
    expect(result.fix.instructions.join("\n")).toContain("gh pr close 42");
    expect(result.fix.checks).toEqual([]);
    const text = formatIterateResult(result);
    expect(text).toContain("**unreported required** `build`, `tests`");
    expect(text).toContain("**trunk behind** `2`");
  });

  it("prepends the missing checks to a stale stack-boundary repair", async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-unreported-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
    mockFindStale.mockResolvedValue({
      instructions: ["Parent boundary is stale."],
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        headSha: "b".repeat(40),
        unreportedRequiredChecks: ["build"],
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") throw new Error("expected fix_code");
    const text = result.fix.instructions.join("\n");
    expect(text).toContain("`build`");
    expect(text).toContain("Parent boundary is stale.");
  });
});
