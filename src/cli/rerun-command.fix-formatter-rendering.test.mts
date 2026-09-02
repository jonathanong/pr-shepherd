import { describe, expect, it } from "vitest";

import { formatIterateResult } from "./iterate-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

describe("## Failing checks — authorized rerun rendering", () => {
  it("renders the [rerun authorized] tag and rerun command when rerunCommand is set", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "tests",
        runId: "33295262562",
        detailsUrl: "https://github.com/owner/repo/actions/runs/33295262562",
        conclusion: "CANCELLED",
        rerunCommand: "gh run rerun 33295262562 -R owner/repo",
      },
    ];

    const output = formatIterateResult(result);

    expect(output).toContain(
      "- `33295262562` — `tests` [conclusion: CANCELLED] [rerun authorized]",
    );
    expect(output).toContain("  rerun: `gh run rerun 33295262562 -R owner/repo`");
  });

  it("prints the rerun command once per distinct runId, tagging every sharing bullet", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "unit (ubuntu)",
        runId: "999",
        detailsUrl: "https://github.com/owner/repo/actions/runs/999",
        conclusion: "FAILURE",
        rerunCommand: "gh run rerun 999 -R owner/repo",
      },
      {
        name: "unit (macos)",
        runId: "999",
        detailsUrl: "https://github.com/owner/repo/actions/runs/999",
        conclusion: "FAILURE",
        rerunCommand: "gh run rerun 999 -R owner/repo",
      },
    ];

    const output = formatIterateResult(result);

    expect(output.match(/\[rerun authorized\]/g)).toHaveLength(2);
    expect(output.match(/rerun: `gh run rerun 999 -R owner\/repo`/g)).toHaveLength(1);
    expect(output.indexOf("rerun:")).toBeGreaterThan(output.indexOf("unit (ubuntu)"));
    expect(output.indexOf("rerun:")).toBeLessThan(output.indexOf("unit (macos)"));
  });

  it("omits the tag and rerun line when rerunCommand is not set", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "tests",
        runId: "33295262562",
        detailsUrl: "https://github.com/owner/repo/actions/runs/33295262562",
        conclusion: "CANCELLED",
        runAttempt: 2,
      },
    ];

    const output = formatIterateResult(result);

    expect(output).not.toContain("[rerun authorized]");
    expect(output).not.toContain("rerun:");
    expect(output).toContain("[attempt: 2]");
  });
});
