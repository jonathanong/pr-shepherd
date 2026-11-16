import { describe, expect, it } from "vitest";
import type { AgentCheck } from "../../types.mts";
import {
  buildCheckFollowUpInstructions,
  buildEvidenceFollowUpInstruction,
  isEvidenceFollowUpCheck,
} from "./check-follow-up.mts";

describe("isEvidenceFollowUpCheck", () => {
  const base = { runId: "9", conclusion: "FAILURE", logExcerpt: "boom" } as AgentCheck;
  it("accepts an external check with a details URL", () => {
    const ext = { runId: null, conclusion: "FAILURE", detailsUrl: "https://x" } as AgentCheck;
    expect(isEvidenceFollowUpCheck(ext, false)).toBe(true);
  });
  it("rejects a check with a rerun, or no evidence", () => {
    expect(isEvidenceFollowUpCheck({ ...base, rerunCommand: "r", runAttempt: 2 }, false)).toBe(
      false,
    );
    expect(isEvidenceFollowUpCheck({ ...base, logExcerpt: "", runAttempt: 2 }, false)).toBe(false);
  });
  it("accepts a later attempt with an excerpt", () => {
    expect(isEvidenceFollowUpCheck({ ...base, runAttempt: 2 }, false)).toBe(true);
  });
  it("accepts a merge-group failure only when the PR is not queued", () => {
    const mg = { ...base, scope: "merge_group" } as AgentCheck;
    expect(isEvidenceFollowUpCheck(mg, false)).toBe(true);
    expect(isEvidenceFollowUpCheck(mg, true)).toBe(false);
  });
  it("leaves a first-attempt pull-request failure to the rerun path", () => {
    expect(isEvidenceFollowUpCheck(base, false)).toBe(false);
  });
  it("names the playbook and the escalation", () => {
    expect(buildEvidenceFollowUpInstruction()).toContain('Playbook: "Check follow-up"');
  });
});

const check = (runId: string | null) => ({ runId }) as AgentCheck;

describe("buildCheckFollowUpInstructions", () => {
  it("names one `gh run view` per distinct Actions run", () => {
    const [step] = buildCheckFollowUpInstructions(
      [check("7"), check("7"), check("8")],
      "o/r",
      new Set(["7", "8"]),
    );
    expect(step).toContain(
      "Start with `gh run view 7 -R o/r`, `gh run view 8 -R o/r`: it lists the run's jobs and annotations.",
    );
  });

  it("skips a run id that is not a confirmed Actions run", () => {
    const [step] = buildCheckFollowUpInstructions(
      [check("7"), check("123")],
      "o/r",
      new Set(["7"]),
    );
    expect(step).toContain("Start with `gh run view 7 -R o/r`:");
    expect(step).not.toContain("123");
  });

  it("names no command when no check has an Actions run", () => {
    const [step, outcome] = buildCheckFollowUpInstructions(
      [check(null), check("123")],
      "o/r",
      new Set(),
    );
    expect(step).not.toContain("gh run view");
    expect(step).toContain('Find out before acting. Playbook: "Check follow-up".');
    expect(outcome).toContain("do not rerun or retrigger these checks");
  });
});
