import { describe, expect, it, vi } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("./iterate/conflict-candidate-files.mts", () => ({
  lookupConflictCandidateFiles: lookup,
}));
registerIterateHooks();

function conflictReport() {
  return makeReport({
    status: "FAILING",
    headSha: "h".repeat(40),
    mergeStatus: {
      status: "CONFLICTS",
      state: "OPEN",
      isDraft: false,
      mergeable: "CONFLICTING",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "DIRTY",
    },
  });
}

describe("runIterate conflict candidate files", () => {
  it("surfaces the capped list in every projection and points the conflict step at it", async () => {
    lookup.mockResolvedValue({ files: ["src/a.ts", "src/b.ts"], total: 5 });
    mockRunCheck.mockResolvedValue(conflictReport());
    const result = await runIterate(makeOpts());
    expect(lookup).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      baseRefName: expect.any(String),
      headRefOid: "h".repeat(40),
    });
    if (result.action !== "triage") throw new Error("expected triage");
    expect(result.conflictCandidateFiles).toEqual({ files: ["src/a.ts", "src/b.ts"], total: 5 });
    const [conflict, pointer] = result.triage.instructions;
    expect(conflict).toContain("merge conflicts");
    expect(pointer).toContain("## Files changed on both sides since the merge base");
    const text = formatIterateResult(result);
    expect(text).toContain(
      "## Files changed on both sides since the merge base\n\n- `src/a.ts`\n- `src/b.ts`\n- +3 more\n",
    );
    expect(projectIterateLean(result)).toMatchObject({
      conflictCandidateFiles: { files: ["src/a.ts", "src/b.ts"], total: 5 },
    });
  });

  it("omits the section and pointer when no shared file is found", async () => {
    lookup.mockResolvedValue(undefined);
    mockRunCheck.mockResolvedValue(conflictReport());
    const result = await runIterate(makeOpts());
    if (result.action !== "triage") throw new Error("expected triage");
    expect(result.conflictCandidateFiles).toBeUndefined();
    expect(result.triage.instructions.join("\n")).not.toContain("Files changed on both sides");
    expect(formatIterateResult(result)).not.toContain("## Files changed on both sides");
    expect(projectIterateLean(result)).not.toHaveProperty("conflictCandidateFiles");
  });

  it("skips the lookup for a native stack layer and for a non-conflicting PR", async () => {
    lookup.mockClear();
    const stacked = conflictReport();
    stacked.mergeStatus.mergeRequirements = {
      approvals: { current: 0, requiredCount: 0 },
      conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
      stack: { number: 9, size: 1, position: 1, baseRefName: "main" },
    };
    mockRunCheck.mockResolvedValue(stacked);
    await runIterate(makeOpts());
    const behind = conflictReport();
    behind.mergeStatus.status = "BEHIND";
    behind.mergeStatus.mergeable = "MERGEABLE";
    behind.mergeStatus.mergeStateStatus = "BEHIND";
    mockRunCheck.mockResolvedValue(behind);
    await runIterate(makeOpts());
    expect(lookup).not.toHaveBeenCalled();
  });
});
