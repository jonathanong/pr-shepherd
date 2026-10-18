import { describe, it, expect } from "vitest";
import { formatNameList, formatSuppressedNameLines } from "./iterate-check-names.mts";
import { formatActivityLine } from "./iterate-activity-formatter.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { capList, moreSuffix } from "../util/cap-list.mts";
import { buildSummary, buildWaitLog } from "../commands/iterate/helpers.mts";
import {
  makeIterateResult,
  projectIterateLean,
} from "../../test-helpers/cli/iterate-lean.test-support.mts";
import type { ActiveCheck, ShepherdReport } from "../types.mts";

const names = (n: number, prefix = "c") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const active = (n: number): ActiveCheck[] =>
  names(n).map((name) => ({ name, status: "IN_PROGRESS", runId: null, detailsUrl: null }));

describe("capList / moreSuffix", () => {
  it("keeps up to five items with no hidden count", () => {
    expect(capList(names(5))).toEqual({ shown: names(5), hidden: 0 });
    expect(moreSuffix(0)).toBe("");
  });
  it("hides items past five", () => {
    expect(capList(names(7))).toEqual({ shown: names(5), hidden: 2 });
    expect(moreSuffix(2)).toBe(", +2 more");
  });
});

describe("formatNameList", () => {
  it("caps lean lists and appends +N more", () => {
    expect(formatNameList(names(6), false)).toBe("`c1`, `c2`, `c3`, `c4`, `c5`, +1 more");
  });
  it("lists every name in verbose mode", () => {
    expect(formatNameList(names(6), true)).toBe("`c1`, `c2`, `c3`, `c4`, `c5`, `c6`");
  });
});

describe("formatSuppressedNameLines", () => {
  it("omits both lines when the lists are empty", () => {
    expect(formatSuppressedNameLines(makeIterateResult("wait"), false)).toEqual([]);
  });
  it("caps ignored and superseded names", () => {
    const result = {
      ...makeIterateResult("wait"),
      ignoredNames: names(6, "i"),
      supersededNames: names(2, "s"),
    };
    expect(formatSuppressedNameLines(result, false)).toEqual([
      "**ignored** `i1`, `i2`, `i3`, `i4`, `i5`, +1 more",
      "**superseded** `s1`, `s2`",
    ]);
  });
});

describe("activity line and lean JSON caps", () => {
  it("caps the lean activity line and lists all checks in verbose mode", () => {
    const result = { ...makeIterateResult("wait"), inProgressChecks: active(6) };
    expect(formatActivityLine(result)).toContain("`c5`, +1 more");
    expect(formatActivityLine(result, true)).toContain("`c5`, `c6`");
  });
  it("emits the hidden count only when items are hidden", () => {
    const five = projectIterateLean({
      ...makeIterateResult("wait"),
      inProgressChecks: active(5),
      ignoredNames: names(5),
    }) as Record<string, unknown>;
    expect((five.inProgressChecks as unknown[]).length).toBe(5);
    expect(five.inProgressChecksMore).toBeUndefined();
    expect(five.ignoredNamesMore).toBeUndefined();
    const seven = projectIterateLean({
      ...makeIterateResult("wait"),
      inProgressChecks: active(7),
      supersededNames: names(7),
    }) as Record<string, unknown>;
    expect((seven.inProgressChecks as unknown[]).length).toBe(5);
    expect(seven.inProgressChecksMore).toBe(2);
    expect((seven.supersededNames as unknown[]).length).toBe(5);
    expect(seven.supersededNamesMore).toBe(2);
  });
});

describe("queued summary split", () => {
  it("counts not-yet-started statuses as queued", () => {
    const statuses = ["IN_PROGRESS", "QUEUED", "WAITING", "PENDING", "REQUESTED"] as const;
    const report = {
      checks: {
        passing: [],
        skipped: [],
        filtered: [],
        inProgress: statuses.map((status) => ({ name: status, status })),
      },
    } as unknown as ShepherdReport;
    expect(buildSummary(report)).toMatchObject({ inProgress: 1, queued: 4 });
  });
  it("shows a queued-only count in the wait log and both summary lines", () => {
    const base = makeIterateResult("wait");
    const result = {
      ...base,
      summary: { ...base.summary, passing: 0, inProgress: 0, queued: 2 },
    };
    expect(buildWaitLog(result)).toContain("2 queued");
    expect(formatIterateResult(result)).toContain("**summary** 2 queued");
    expect(formatIterateResult(result, { verbose: true })).toContain("0 inProgress, 2 queued,");
    expect((projectIterateLean(result) as { summary: unknown }).summary).toEqual({ queued: 2 });
  });
});
