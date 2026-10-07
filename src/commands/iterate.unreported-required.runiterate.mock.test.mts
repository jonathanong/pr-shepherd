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
import { projectIterateLean } from "../cli/iterate-lean.mts";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { runPoll } from "./poll.mts";
import { readCiRetrigger } from "../state/ci-retrigger.mts";

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
    const instructions = result.fix.instructions.join("\n");
    expect(instructions).toContain("The stack trunk is behind by 2 commits.");
    expect(instructions).toContain("No CI checks are running, and required checks have not passed");
    expect(instructions).toContain("Rebase onto `main` and push.");
    expect(instructions).not.toContain("gh pr close 42");
    expect(result.fix.checks).toEqual([]);
    const text = formatIterateResult(result);
    expect(text).toContain("**unreported required** `build`, `tests`");
    expect(text).toContain("**trunk behind** `2`");
  });

  it("does not consume the reopen instruction on a non-persisting iterate tick", async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-unreported-preview-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
    mockFindStale.mockResolvedValue(null);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        headSha: "d".repeat(40),
        unreportedRequiredChecks: ["build", "tests"],
        trunkBehindBy: undefined,
        baseBehindBy: undefined,
      }),
    );

    const preview = await runIterate(makeOpts({ persistSeen: false }));
    const firstPresented = await runIterate(makeOpts({ persistSeen: true }));
    const nextPresented = await runIterate(makeOpts({ persistSeen: true }));

    expect(preview.action).toBe("fix_code");
    expect(firstPresented.action).toBe("fix_code");
    if (firstPresented.action !== "fix_code") throw new Error("expected fix_code");
    expect(firstPresented.fix.instructions.join("\n")).toContain("gh pr close 42");
    expect(nextPresented.action).toBe("escalate");
  });

  it("keeps the reopen instruction through the real poll debounce", async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-unreported-poll-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
    mockFindStale.mockResolvedValue(null);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        headSha: "e".repeat(40),
        unreportedRequiredChecks: ["build", "tests"],
        trunkBehindBy: undefined,
        baseBehindBy: undefined,
      }),
    );

    const resultPromise = runPoll({
      ...makeOpts(),
      intervalSeconds: 60,
      timeoutSeconds: 60,
      debounceSeconds: 60,
      untilTerminal: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRunCheck).toHaveBeenCalledTimes(1);
    expect(await readCiRetrigger({ owner: "owner", repo: "repo", pr: 42 })).toBeUndefined();

    await vi.advanceTimersByTimeAsync(60_000);
    const result = await resultPromise;
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") throw new Error("expected fix_code");
    expect(result.fix.instructions.join("\n")).toContain("gh pr close 42");
    expect(mockRunCheck).toHaveBeenCalledTimes(2);
    expect(await readCiRetrigger({ owner: "owner", repo: "repo", pr: 42 })).toMatchObject({
      headSha: "e".repeat(40),
      contexts: ["build", "tests"],
    });
  });

  it("prints the base compare count when merge status is BLOCKED", async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-unreported-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
    mockFindStale.mockResolvedValue(null);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        headSha: "c".repeat(40),
        unreportedRequiredChecks: ["static", "backend"],
        baseBehindBy: 93,
        mergeStatus: {
          status: "BLOCKED",
          state: "OPEN",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "BLOCKED",
        },
      }),
    );

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    const text = formatIterateResult(result);
    expect(text).toContain("**behind** `93`");
    expect(text).toContain("This branch is behind `main` by 93 commits.");
    expect(text).toContain("No CI checks are running, and required checks have not passed");
    expect(projectIterateLean(result)).toMatchObject({ baseBehindBy: 93 });
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
