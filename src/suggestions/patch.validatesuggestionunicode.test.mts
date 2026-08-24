import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

describe("getUnsafeSuggestionRangeReason — Unicode substantive lines", () => {
  it.each([
    {
      name: "Chinese",
      original: "配置项目名称是非常长的原始设置值",
      replacement: "配置项目名称是非常长的更新设置值",
    },
    {
      name: "Arabic",
      original: "إعداد_القيمة_الأصلية_الطويلة",
      replacement: "إعداد_القيمة_المحدثة_الطويلة",
    },
    {
      name: "Arabic-Indic numeric",
      original: "١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦٧٨٩٠",
      replacement: "١٢٣٤٥٦٧٨٩٠٩٩٣٤٥٦٧٨٩٠",
    },
  ])("rejects a padded $name adjacent rewrite", ({ original, replacement }) => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\nanchor\n`,
        startLine: 2,
        endLine: 2,
        replacementLines: ["prepare();", replacement, "finish();"],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects a Unicode rewrite after the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "anchor\n配置项目名称是非常长的原始设置值\n",
        startLine: 1,
        endLine: 1,
        replacementLines: ["prepare();", "配置项目名称是非常长的更新设置值", "finish();"],
      }),
    ).toContain("partially rewrites a source block after");
  });

  it("does not treat short Unicode text as a neutral delimiter", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "const value = computeOriginalThing();\n待办\nanchor\n",
        startLine: 3,
        endLine: 3,
        replacementLines: [
          "prepare();",
          "const value = computeUpdatedThing();",
          "待办",
          "finish();",
        ],
      }),
    ).toBeNull();
  });

  it("detects a mixed exact-and-changed Unicode window", () => {
    const original = "配置项目名称是非常长的原始设置值";
    const replacement = "配置项目名称是非常长的更新设置值";
    const stable = "保留这一行作为完全相同的配置内容";
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n${stable}\nanchor\n`,
        startLine: 3,
        endLine: 3,
        replacementLines: ["prepare();", replacement, stable, "finish();"],
      }),
    ).toContain("partially rewrites a source block before");
  });
});
