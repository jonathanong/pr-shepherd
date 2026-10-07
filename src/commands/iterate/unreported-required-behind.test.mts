import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IterateResultBase, ShepherdReport } from "../../types.mts";
import { planUnreportedRequired } from "./unreported-required.mts";

const stateKey = { owner: "acme", repo: "widgets", pr: 622 };
const headSha = "a".repeat(40);
const base = { pr: 622, repo: "acme/widgets" } as IterateResultBase;

function blocked(behindBy: number | undefined, status: "BLOCKED" | "BEHIND"): ShepherdReport {
  return {
    pr: 622,
    repo: "acme/widgets",
    baseBranch: "main",
    status: "PENDING",
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    mergeStatus: {
      status,
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      mergeStateStatus: status,
    },
    unreportedRequiredChecks: ["static", "backend"],
    ...(behindBy !== undefined && { baseBehindBy: behindBy }),
  } as unknown as ShepherdReport;
}

describe("planUnreportedRequired behind a BLOCKED base", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-retrigger-behind-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("names the commit gap and asks for a rebase when merge status is BLOCKED", async () => {
    const plan = await planUnreportedRequired({
      report: blocked(93, "BLOCKED"),
      base,
      stateKey,
      headSha,
      otherAutonomousWork: true,
    });
    const text = plan.repairInstructions?.join("\n") ?? "";
    expect(text).toContain("This branch is behind `main` by 93 commits.");
    expect(text).toContain("No CI checks are running, and required checks have not passed");
    expect(text).toContain("`static`, `backend`");
    expect(text).toContain("Rebase onto `main` and push.");
    expect(text).toContain("If that push does not start the checks, investigate");
    expect(text).not.toContain("gh pr close");
  });

  it("rebases a BEHIND PR that has no compare count yet", async () => {
    const plan = await planUnreportedRequired({
      report: blocked(undefined, "BEHIND"),
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    const text = plan.repairInstructions?.join("\n") ?? "";
    expect(text).toContain("derived merge status is BEHIND");
    expect(text).toContain("Rebase onto `main` and push.");
    expect(text).not.toContain("gh pr close");
  });

  it("does not consume the one reopen during an internal preview tick", async () => {
    const current = blocked(undefined, "BLOCKED");
    const preview = await planUnreportedRequired({
      report: current,
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
      persistState: false,
    });
    expect(preview.repairInstructions?.join("\n")).toContain("gh pr close 622 -R acme/widgets");

    const firstPresented = await planUnreportedRequired({
      report: current,
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
      persistState: true,
    });
    expect(firstPresented.repairInstructions?.join("\n")).toContain(
      "gh pr close 622 -R acme/widgets",
    );

    const nextPresented = await planUnreportedRequired({
      report: current,
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
      persistState: true,
    });
    expect(nextPresented.repairInstructions).toBeUndefined();
    expect(nextPresented.escalate?.action).toBe("escalate");
  });
});
