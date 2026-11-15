import { describe, expect, it } from "vitest";
import { normalizeWorkflowPath } from "./workflow-path.mts";

describe("normalizeWorkflowPath", () => {
  it("drops a ref suffix and whitespace", () => {
    expect(normalizeWorkflowPath(" .github/workflows/ci.yml@refs/heads/main ")).toBe(
      ".github/workflows/ci.yml",
    );
    expect(normalizeWorkflowPath(".github/workflows/ci.yml")).toBe(".github/workflows/ci.yml");
  });
  it("is undefined for blank or missing input", () => {
    expect(normalizeWorkflowPath(" ")).toBeUndefined();
    expect(normalizeWorkflowPath("@refs/heads/main")).toBeUndefined();
    expect(normalizeWorkflowPath(null)).toBeUndefined();
    expect(normalizeWorkflowPath(undefined)).toBeUndefined();
  });
});
