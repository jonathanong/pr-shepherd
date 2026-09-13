import { afterEach, describe, expect, it, vi } from "vitest";

import type { PollSummaryItem, PollSummaryResult, ShepherdAction } from "../types.mts";
import { emitPollSummaryResult } from "./poll-summary-emitter.mts";

function result(action: ShepherdAction, reasons: string[] = [action]): PollSummaryResult {
  const row: PollSummaryItem = {
    pr: 42,
    repo: "acme/widgets",
    title: "Widgets",
    url: "https://github.com/acme/widgets/pull/42",
    action,
    reasons,
    state: action === "cancel" ? "MERGED" : "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    headRefName: "widgets",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
  };
  return {
    mode: "summary",
    repo: "acme/widgets",
    selection: { kind: "prs", requested: [42] },
    reason: action === "cancel" ? "all_terminal" : "actionable",
    prs: [row],
  };
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("emitPollSummaryResult", () => {
  it("preserves the closed exit code for a terminal native stack", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const value = result("cancel", ["closed"]);
    value.selection = { kind: "stack", anchor: 42, stackNumber: 7, stackSize: 1 };
    value.nextAction = "cancel";
    emitPollSummaryResult(value, { format: "text" });
    expect(process.exitCode).toBe(14);
  });

  it.each([
    ["escalate", 13, undefined],
    ["fix_code", 12, undefined],
    ["merge", 15, undefined],
    ["mark_ready", 11, undefined],
    ["wait", 10, undefined],
    ["cancel", 14, ["closed"]],
    ["cancel", 0, ["merged"]],
  ] as const)("maps %s to its aggregate exit code", (action, code, reasons) => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    emitPollSummaryResult(result(action, reasons ? [...reasons] : undefined), { format: "text" });
    expect(process.exitCode).toBe(code);
  });

  it("emits the same raw result as JSON", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const value = result("fix_code");
    emitPollSummaryResult(value, { format: "json" });
    expect(JSON.parse(String(write.mock.calls[0]![0]))).toEqual(value);
  });
});
