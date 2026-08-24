import { describe, it, expect } from "vitest";
import { validateJournalItem, appendJournalItem } from "./transform.mts";

describe("validateJournalItem", () => {
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
  it("rejects a standalone details closing tag", () => {
    const result = validateJournalItem("- Item\n</details>");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("</details>");
  });
});

describe("appendJournalItem — section absent", () => {
  it("creates the section at the end of an empty body", () => {
    const { body, mutated, sectionExisted } = appendJournalItem("", "- First entry.");
    expect(mutated).toBe(true);
    expect(sectionExisted).toBe(false);
    expect(body).toBe(
      "<details>\n<summary>Shepherd Journal</summary>\n\n- First entry.\n</details>",
    );
  });
});

describe("appendJournalItem — canonical details present", () => {
  it("appends to an existing section with content", () => {
    const existing = "<details>\n<summary>Shepherd Journal</summary>\n\n- Old entry.\n</details>";
    const { body, mutated, sectionExisted } = appendJournalItem(existing, "- New entry.");
    expect(mutated).toBe(true);
    expect(sectionExisted).toBe(true);
    expect(body).toBe(
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Old entry.\n- New entry.\n</details>",
    );
  });
  it("appends before the closing details tag", () => {
    const existing =
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Old entry.\n</details>\n\n## Related Issues\n\n- issue #1";
    const { body } = appendJournalItem(existing, "- New entry.");
    expect(body).toBe(
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Old entry.\n- New entry.\n</details>\n\n## Related Issues\n\n- issue #1",
    );
  });
});

describe("appendJournalItem — idempotency", () => {
  it("returns mutated=false when the exact item is already present", () => {
    const existing =
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Already here.\n</details>";
    const { body, mutated } = appendJournalItem(existing, "- Already here.");
    expect(mutated).toBe(false);
    expect(body).toBe(existing);
  });

  it("appends after a balanced nested details block", () => {
    const body =
      "<details>\n<summary>Shepherd Journal</summary>\n\n<details>\n- Nested.\n</details>\n</details>";
    expect(appendJournalItem(body, "- New.").body).toBe(
      "<details>\n<summary>Shepherd Journal</summary>\n\n<details>\n- Nested.\n</details>\n- New.\n</details>",
    );
  });

  it("deduplicates CRLF and trailing whitespace without changing the body", () => {
    const existing =
      "<details>\r\n<summary>Shepherd Journal</summary>\r\n\r\n- Entry.   \r\n</details>";
    expect(appendJournalItem(existing, "- Entry.")).toEqual({
      body: existing,
      mutated: false,
      sectionExisted: true,
    });
  });
});

describe("appendJournalItem — code fence safety", () => {
  it("ignores a ## Shepherd Journal line inside a fenced code block", () => {
    const existing = "## Summary\n\n```\n## Shepherd Journal\n```\n\nSome body text.";
    const { body, sectionExisted } = appendJournalItem(existing, "- Real entry.");
    expect(sectionExisted).toBe(false);
    expect(body).toContain(
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Real entry.\n</details>",
    );
  });

  it("correctly finds the heading after a closed fence", () => {
    const existing =
      "```\ncode\n```\n\n<details>\n<summary>Shepherd Journal</summary>\n\n- Existing.\n</details>";
    const { body, sectionExisted } = appendJournalItem(existing, "- New.");
    expect(sectionExisted).toBe(true);
    expect(body).toContain("- Existing.\n- New.");
  });

  it.each(["```js\n```not-a-close\n", "~~~~md\n~~~~not-a-close\n"])(
    "does not close a fenced block on %s",
    (fence) => {
      const body = `${fence}<details>\n<summary>Shepherd Journal</summary>\n\n- Hidden.\n</details>`;
      expect(appendJournalItem(body, "- Real entry.").sectionExisted).toBe(false);
    },
  );
});

describe("appendJournalItem — heading variant matching", () => {
  it("migrates a legacy section in place and preserves following sections", () => {
    const existing =
      "## Summary\n\nText.\n\n## Shepherd Journal\n\n- Entry.\n\n## Related Issues\n\n- #1";
    const { body, mutated, sectionExisted } = appendJournalItem(existing, "- New.");
    expect(mutated).toBe(true);
    expect(sectionExisted).toBe(true);
    expect(body).toBe(
      "## Summary\n\nText.\n\n<details>\n<summary>Shepherd Journal</summary>\n\n- Entry.\n- New.\n</details>\n\n## Related Issues\n\n- #1",
    );
  });

  it("migrates a legacy section even when the item is already present", () => {
    const existing = "## Shepherd Journal\n\n- Entry.";
    const result = appendJournalItem(existing, "- Entry.");
    expect(result).toEqual({
      body: "<details>\n<summary>Shepherd Journal</summary>\n\n- Entry.\n</details>",
      mutated: true,
      sectionExisted: true,
    });
  });

  it("normalizes legacy content without a summary blank line", () => {
    expect(appendJournalItem("## Shepherd Journal\n- Entry.", "- Entry.").body).toBe(
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Entry.\n</details>",
    );
  });

  it("ignores canonical markers in fenced code", () => {
    const existing = "```md\n<details>\n<summary>Shepherd Journal</summary>\n</details>\n```";
    const { sectionExisted } = appendJournalItem(existing, "- Real entry.");
    expect(sectionExisted).toBe(false);
  });

  it.each([
    [
      "unterminated canonical container",
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Entry.",
    ],
    [
      "malformed canonical summary",
      "<details>\n<summary>Shepherd Journal</summary> extra\n</details>",
    ],
    [
      "duplicate canonical containers",
      "<details>\n<summary>Shepherd Journal</summary>\n\n- One.\n</details>\n\n<details>\n<summary>Shepherd Journal</summary>\n\n- Two.\n</details>",
    ],
    [
      "ambiguous legacy and canonical containers",
      "## Shepherd Journal\n\n- Legacy.\n\n<details>\n<summary>Shepherd Journal</summary>\n\n- Canonical.\n</details>",
    ],
    [
      "canonical container without a summary blank line",
      "<details>\n<summary>Shepherd Journal</summary>\n- Entry.\n</details>",
    ],
    [
      "unmatched nested details in canonical content",
      "<details>\n<summary>Shepherd Journal</summary>\n\n<details>\n- Nested.\n</details>",
    ],
    [
      "nested canonical summary",
      "<details>\n<summary>Shepherd Journal</summary>\n\n<details>\n<summary>Shepherd Journal</summary>\n\n- Nested.\n</details>\n</details>",
    ],
    ["malformed journal-like summary", "<summary> Shepherd Journal</summary>"],
    [
      "padded opening marker",
      "  <details>\n<summary>Shepherd Journal</summary>\n\n- Entry.\n</details>",
    ],
    [
      "padded summary marker",
      "<details>\n  <summary>Shepherd Journal</summary>\n\n- Entry.\n</details>",
    ],
    [
      "padded closing marker",
      "<details>\n<summary>Shepherd Journal</summary>\n\n- Entry.\n  </details>",
    ],
    ["standalone details close in legacy content", "## Shepherd Journal\n\n- Legacy.\n</details>"],
  ])("fails closed for %s", (_name, body) => {
    expect(() => appendJournalItem(body, "- New.")).toThrow(/journal/i);
  });
});
