import { describe, expect, it } from "vitest";
import {
  buildQueueRemovalAcknowledgmentInstruction,
  buildRequeueInstruction,
} from "./queue-recovery-instructions.mts";

describe("buildRequeueInstruction", () => {
  const text = buildRequeueInstruction("main", "queue-commit-1");

  it("orders rebase, fix, and transient-only requeue", () => {
    const rebase = text.indexOf("Rebase the PR head onto the latest `main`");
    const fix = text.indexOf("If the failure belongs to this PR, fix it");
    const requeue = text.indexOf("run the `requeue:` command exactly as printed");
    expect(rebase).toBeGreaterThan(-1);
    expect(fix).toBeGreaterThan(rebase);
    expect(requeue).toBeGreaterThan(fix);
  });

  it("names the queue commit and forbids requeue after a push", () => {
    expect(text).toContain("queue commit `queue-commit-1`");
    expect(text).toContain("do not run `requeue:` after any push");
    expect(text).toContain("the logs show a transient failure");
  });
});

describe("buildQueueRemovalAcknowledgmentInstruction", () => {
  it("acknowledges only transient failures", () => {
    const text = buildQueueRemovalAcknowledgmentInstruction();
    expect(text).toContain("do not acknowledge it; report it");
    expect(text).toContain(
      "the logs show a transient failure, run `acknowledge queue removal:` exactly as printed",
    );
  });
});
