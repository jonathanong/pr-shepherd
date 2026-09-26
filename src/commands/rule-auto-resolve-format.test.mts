import { describe, expect, it } from "vitest";
import type { AutoResolvedThread, ShepherdReport } from "../types.mts";
import {
  decorateAutoResolveError,
  formatRuleAutoResolveJournalItem,
  insertRuleAutoResolveSection,
  minimizedItem,
  projectRuleAutoResolve,
  reasonClause,
  reasonsForError,
  resolvedThread,
  ruleAutoResolveBody,
  ruleAutoResolveFromReport,
  stripReplayedRuleAutoResolve,
  uniqueReasons,
} from "./rule-auto-resolve-format.mts";

const thread = { id: "t1", url: " https://t ", isResolved: false } as AutoResolvedThread;

function report(overrides: {
  autoResolved?: ShepherdReport["threads"]["autoResolved"];
  autoResolveErrors?: string[];
  autoResolveErrorReasons?: string[];
  autoMinimized?: NonNullable<ShepherdReport["comments"]["autoMinimized"]>;
}): ShepherdReport {
  return {
    threads: {
      actionable: [],
      resolutionOnly: [],
      firstLook: [],
      autoResolved: overrides.autoResolved ?? [],
      autoResolveErrors: overrides.autoResolveErrors ?? [],
      ...(overrides.autoResolveErrorReasons
        ? { autoResolveErrorReasons: overrides.autoResolveErrorReasons }
        : {}),
    },
    comments: {
      actionable: [],
      firstLook: [],
      ...(overrides.autoMinimized ? { autoMinimized: overrides.autoMinimized } : {}),
    },
  } as unknown as ShepherdReport;
}

describe("rule auto-resolve formatting", () => {
  it("builds the summary, journal line, and markdown section", () => {
    expect(uniqueReasons([" a ", "", "a", "b"])).toEqual(["a", "b"]);
    expect(reasonClause([])).toBeUndefined();
    expect(reasonClause([" a ", "a"])).toBe("(rule: a)");
    expect(reasonClause(["a", "b"])).toBe("(rules: a; b)");
    expect(ruleAutoResolveBody({ threads: 0, comments: 0, reviewSummaries: 0 })).toBeUndefined();
    expect(ruleAutoResolveBody({ threads: 1, comments: 0, reviewSummaries: 0 })).toBe(
      "auto-resolved 1 thread",
    );
    expect(ruleAutoResolveBody({ threads: 2, comments: 1, reviewSummaries: 2 })).toBe(
      "auto-resolved 2 threads, minimized 1 comment and 2 review summaries",
    );
    expect(ruleAutoResolveBody({ threads: 0, comments: 2, reviewSummaries: 1 })).toBe(
      "minimized 2 comments and 1 review summary",
    );
    expect(resolvedThread(thread, ["a", "a", "b"]).ruleReason).toBe("a; b");
    expect(
      formatRuleAutoResolveJournalItem({
        body: "auto-resolved 1 thread",
        reasons: ["noise"],
        viewerLogin: "alice",
        urls: [" https://t ", ""],
      }),
    ).toBe("- auto-resolved 1 thread as @alice (rule: noise): https://t");
    expect(
      formatRuleAutoResolveJournalItem({
        body: "auto-resolved 1 thread",
        reasons: [],
        viewerLogin: "  ",
        urls: [],
      }),
    ).toBe("- auto-resolved 1 thread (token login unavailable)");
    expect(decorateAutoResolveError("c1: failed", [])).toBe("c1: failed");
    expect(decorateAutoResolveError("c1: failed", ["noise"])).toBe("c1: failed (rule: noise)");
    expect(minimizedItem("pr-comment", "c1", "  ", [])).toEqual({ id: "c1", kind: "pr-comment" });
    expect(minimizedItem("review-summary", "r1", " https://r ", ["noise"])).toEqual({
      id: "r1",
      kind: "review-summary",
      url: "https://r",
      ruleReason: "noise",
    });
    expect(resolvedThread(thread, []).isResolved).toBe(true);
    expect(resolvedThread(thread, []).ruleReason).toBeUndefined();
    expect(resolvedThread(thread, ["noise"]).ruleReason).toBe("noise");
    const event = ruleAutoResolveFromReport(
      report({
        autoResolved: [{ ...thread, ruleReason: "a; ; b" }],
        autoMinimized: [{ id: "c1", kind: "pr-comment", ruleReason: "" }],
      }),
    );
    expect(event?.summary).toBe("auto-resolved 1 thread, minimized 1 comment (rules: a; b)");
    expect(event?.errors).toBeUndefined();
    const section = insertRuleAutoResolveSection("", {
      summary: "auto-resolved 1 thread",
      threads: [
        { ...thread, url: "  " },
        { ...thread, id: "t2", url: "https://t2" },
      ],
      minimized: [
        { id: "c1", kind: "pr-comment", url: " https://c " },
        { id: "c2", kind: "review-summary" },
      ],
      errors: ["c1: failed"],
    });
    expect(section.slice(2)).toBe(
      [
        "## Classification auto-resolve",
        "",
        "auto-resolved 1 thread",
        "",
        "- `t1`",
        "- https://t2",
        "- https://c",
        "- `c2`",
        "",
        "- c1: failed",
      ].join("\n"),
    );
    expect(
      ruleAutoResolveFromReport(report({ autoResolved: [{ ...thread, url: "https://t" }] }))
        ?.summary,
    ).toBe("auto-resolved 1 thread");
    expect(insertRuleAutoResolveSection("body", undefined)).toBe("body");
    expect(insertRuleAutoResolveSection("body", { summary: "auto-resolved 1 thread" })).toBe(
      "body\n\n## Classification auto-resolve\n\nauto-resolved 1 thread",
    );
    expect(
      insertRuleAutoResolveSection("head\n\n## Instructions\n\n1. go", {
        summary: "auto-resolved 1 thread",
      }),
    ).toBe(
      "head\n\n## Classification auto-resolve\n\nauto-resolved 1 thread\n\n## Instructions\n\n1. go",
    );
    expect(projectRuleAutoResolve({ summary: "s", threads: [], errors: [] })).toEqual({
      summary: "s",
    });
    expect(projectRuleAutoResolve({ summary: "s", threads: [thread], errors: ["e"] })).toEqual({
      summary: "s",
      threads: [thread],
      errors: ["e"],
    });
  });

  it("reports mutation failures and strips a replayed event", () => {
    const reasons = new Map<string, string[]>([
      ["c1", ["noise"]],
      ["c2", ["quota"]],
    ]);
    expect(reasonsForError("c1: failed", ["c1"], reasons)).toEqual(["noise"]);
    expect(reasonsForError("c-missing: failed", ["c1"], reasons)).toEqual([]);
    expect(reasonsForError("rate limit: slow", ["c1", "c2"], reasons)).toEqual(["noise", "quota"]);
    expect(reasonsForError("network", ["c1"], reasons)).toEqual([]);
    expect(ruleAutoResolveFromReport(report({}))).toBeUndefined();
    expect(
      ruleAutoResolveFromReport(
        report({
          autoResolveErrors: ["c1: failed"],
          autoResolveErrorReasons: ["quota (daily); extra"],
        }),
      )?.summary,
    ).toBe("auto-resolve failed for 1 mutation (rule: quota (daily); extra)");
    expect(
      ruleAutoResolveFromReport(report({ autoResolveErrors: ["c1: failed (rule: noise)"] }))
        ?.summary,
    ).toBe("auto-resolve failed for 1 mutation");
    expect(
      ruleAutoResolveFromReport(
        report({
          autoResolveErrors: ["c1: failed", "network", "c2: failed"],
          autoResolveErrorReasons: ["a", "b"],
        }),
      )?.summary,
    ).toBe("auto-resolve failed for 3 mutations (rules: a; b)");
    const clean = report({});
    expect(stripReplayedRuleAutoResolve(clean)).toBe(clean);
    const cached = report({
      autoResolved: [thread],
      autoResolveErrors: ["c1: failed"],
      autoResolveErrorReasons: ["quota (daily); extra"],
      autoMinimized: [{ id: "c1", kind: "pr-comment" }],
    });
    const stripped = stripReplayedRuleAutoResolve(cached);
    expect(stripped.threads.autoResolved).toEqual([]);
    expect(stripped.threads.autoResolveErrors).toEqual([]);
    expect(stripped.threads).not.toHaveProperty("autoResolveErrorReasons");
    expect(stripped.comments).not.toHaveProperty("autoMinimized");
  });
});
