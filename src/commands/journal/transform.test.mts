import { describe, it, expect } from "vitest";
import { validateJournalItem, appendJournalItem } from "./transform.mts";

describe("validateJournalItem", () => {
  it("accepts a plain list item", () => {
    const result = validateJournalItem("- Rejected suggestion: kept existing pattern.");
    expect(result).toEqual({ ok: true, item: "- Rejected suggestion: kept existing pattern." });
  });

  it("accepts a multi-line item with sub-bullets", () => {
    const input = "- Decision\n  - Reason one\n  - Reason two";
    const result = validateJournalItem(input);
    expect(result).toEqual({ ok: true, item: input });
  });

  it("strips trailing whitespace from each line", () => {
    const result = validateJournalItem("- Item   \n  - sub   ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.item).toBe("- Item\n  - sub");
  });

  it("rejects empty input", () => {
    const result = validateJournalItem("   \n  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("empty");
  });

  it("rejects input that does not start with '- '", () => {
    const result = validateJournalItem("Decided to keep the pattern.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('"- <text>"');
  });

  it("rejects input starting with '- ' but followed only by whitespace", () => {
    const result = validateJournalItem("-  ");
    expect(result.ok).toBe(false);
  });

  it("rejects continuation lines starting with #", () => {
    const result = validateJournalItem("- Item\n## sneaky heading");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("#");
  });
});

describe("appendJournalItem — section absent", () => {
  it("creates the section at the end of an empty body", () => {
    const { body, mutated, sectionExisted } = appendJournalItem("", "- First entry.");
    expect(mutated).toBe(true);
    expect(sectionExisted).toBe(false);
    expect(body).toBe("\n## Shepherd Journal\n\n- First entry.");
  });

  it("appends the section after existing content", () => {
    const existing = "## Summary\n\nSome content.";
    const { body, mutated, sectionExisted } = appendJournalItem(existing, "- Note.");
    expect(mutated).toBe(true);
    expect(sectionExisted).toBe(false);
    expect(body).toBe("## Summary\n\nSome content.\n\n## Shepherd Journal\n\n- Note.");
  });

  it("strips trailing blank lines before appending the section", () => {
    const existing = "## Summary\n\nContent.\n\n\n";
    const { body } = appendJournalItem(existing, "- Note.");
    expect(body).toBe("## Summary\n\nContent.\n\n## Shepherd Journal\n\n- Note.");
  });
});

describe("appendJournalItem — section present", () => {
  it("appends to an existing section with content", () => {
    const existing = "## Shepherd Journal\n\n- Old entry.";
    const { body, mutated, sectionExisted } = appendJournalItem(existing, "- New entry.");
    expect(mutated).toBe(true);
    expect(sectionExisted).toBe(true);
    expect(body).toBe("## Shepherd Journal\n\n- Old entry.\n- New entry.");
  });

  it("appends before the next H2 section", () => {
    const existing = "## Shepherd Journal\n\n- Old entry.\n\n## Related Issues\n\n- issue #1";
    const { body } = appendJournalItem(existing, "- New entry.");
    expect(body).toBe(
      "## Shepherd Journal\n\n- Old entry.\n- New entry.\n\n## Related Issues\n\n- issue #1",
    );
  });

  it("handles an empty section (heading only)", () => {
    const existing = "## Shepherd Journal";
    const { body } = appendJournalItem(existing, "- First entry.");
    expect(body).toBe("## Shepherd Journal\n\n- First entry.");
  });

  it("handles a section with only blank lines", () => {
    const existing = "## Shepherd Journal\n\n\n";
    const { body } = appendJournalItem(existing, "- Entry.");
    expect(body).toBe("## Shepherd Journal\n\n- Entry.");
  });
});

describe("appendJournalItem — idempotency", () => {
  it("returns mutated=false when the exact item is already present", () => {
    const existing = "## Shepherd Journal\n\n- Already here.";
    const { body, mutated } = appendJournalItem(existing, "- Already here.");
    expect(mutated).toBe(false);
    expect(body).toBe(existing);
  });

  it("detects a duplicate multi-line item", () => {
    const item = "- Decision\n  - Reason";
    const existing = `## Shepherd Journal\n\n${item}`;
    const { mutated } = appendJournalItem(existing, item);
    expect(mutated).toBe(false);
  });

  it("does NOT deduplicate when text differs even by one character", () => {
    const existing = "## Shepherd Journal\n\n- Entry A.";
    const { mutated } = appendJournalItem(existing, "- Entry B.");
    expect(mutated).toBe(true);
  });
});

describe("appendJournalItem — code fence safety", () => {
  it("ignores a ## Shepherd Journal line inside a fenced code block", () => {
    const existing = "## Summary\n\n```\n## Shepherd Journal\n```\n\nSome body text.";
    const { body, sectionExisted } = appendJournalItem(existing, "- Real entry.");
    expect(sectionExisted).toBe(false);
    expect(body).toContain("## Shepherd Journal\n\n- Real entry.");
  });

  it("correctly finds the heading after a closed fence", () => {
    const existing = "```\ncode\n```\n\n## Shepherd Journal\n\n- Existing.";
    const { body, sectionExisted } = appendJournalItem(existing, "- New.");
    expect(sectionExisted).toBe(true);
    expect(body).toContain("- Existing.\n- New.");
  });
});

describe("appendJournalItem — heading variant matching", () => {
  it("matches heading with trailing spaces", () => {
    const existing = "## Shepherd Journal   \n\n- Entry.";
    const { sectionExisted } = appendJournalItem(existing, "- New.");
    expect(sectionExisted).toBe(true);
  });
});
