import { describe, expect, it } from "vitest";
import { fixture, matches, variant } from "../../../test-helpers/standard-rule-variants.mts";

describe("Kilo and CodeRabbit report edges", () => {
  it("accepts an unmarked Kilo report without a file list", () => {
    const kilo = fixture("kilo-no-issues");
    const body =
      "## Code Review Summary\n\n**Status:** No Issues Found | **Recommendation:** Merge";
    expect(matches(kilo, body)).toEqual(["kilo-no-issues"]);
  });

  it("keeps a marked Kilo report with an extra section after the file list visible", () => {
    const kilo = fixture("kilo-no-issues-real");
    const extra =
      "</details>\n\n<details>\n<summary><b>Other Observations (not in diff)</b></summary>\n\n| `a.ts` | 3 | Bug |\n\n</details>\n\n---";
    expect(matches(kilo, variant(kilo.body, "</details>\n\n---", extra))).toEqual([]);
  });

  it("accepts a marked Kilo overview of prose and lists under ### Overview", () => {
    const kilo = fixture("kilo-no-issues-real");
    const body = variant(
      kilo.body,
      "Kilo-owned placement only:",
      "### Overview\n- First point.\n- Second point.\n\nKilo-owned placement only:",
    );
    expect(matches(kilo, body)).toEqual(["kilo-no-issues"]);
  });

  it.each([
    "### Potential bug\n\n`user` is dereferenced before the null check.",
    "<details>\n<summary>Other Observations</summary>\n\nA bug.\n\n</details>",
    "| File | Line | Issue |\n|---|---|---|\n| `a.ts` | 3 | Bug |",
  ])("keeps a marked Kilo overview with a findings section visible: %s", (section) => {
    const kilo = fixture("kilo-no-issues-real");
    const body = variant(kilo.body, "Kilo-owned placement only:", `${section}\n\nKilo-owned:`);
    expect(matches(kilo, body)).toEqual([]);
  });

  it("keeps an unquoted line inside a CodeRabbit notice envelope visible", () => {
    const limit = fixture("coderabbit-rate-limit-generated-marker");
    const body = variant(
      limit.body,
      "> ## Review limit reached\n",
      "> ## Review limit reached\nA bug.\n",
    );
    expect(matches(limit, body)).toEqual([]);
  });
});
