import { describe, expect, it } from "vitest";
import { appendJournalItem, validateJournalItem } from "./transform.mts";

const CANONICAL = "<details>\n<summary>Shepherd Journal</summary>\n\n- Existing.\n</details>";

describe("journal container hardening", () => {
  it.each([
    "<details>",
    "<details open>",
    "<summary>Shepherd Journal</summary>",
    "<summary> Shepherd Journal</summary>",
    "</details>",
  ])("rejects reserved marker %s in a journal item", (marker) =>
    expect(validateJournalItem(`- Entry.\n${marker}`).ok).toBe(false),
  );

  it.each(["<pre>\n<details>", "<div>\n<details />"])(
    "rejects a reserved marker hidden by a raw HTML block in the legacy transform path",
    (rawHtml) => expect(validateJournalItem(`- Entry.\n${rawHtml}`).ok).toBe(false),
  );

  it.each([
    ["when its list container ends", "- <pre>\noutside list"],
    ["when it closes inside its list container", "- <pre>\n  </pre>"],
  ])("continues legacy validation after raw HTML %s", (_name, item) => {
    expect(validateJournalItem(item).ok).toBe(true);
  });

  it("rejects a duplicate legacy heading after the first section boundary", () => {
    const body =
      "## Shepherd Journal\n\n- First.\n\n## Next\n\nText.\n\n## Shepherd Journal\n\n- Second.";
    expect(() => appendJournalItem(body, "- New.")).toThrow(/duplicate legacy/i);
  });

  it.each(["<!--\n</details>\n-->", "<!--\n-->", "<!-- </details> -->"])(
    "ignores details markers while processing HTML comment state %s",
    (comment) => {
      const body = CANONICAL.replace("\n</details>", `\n${comment}\n</details>`);
      expect(appendJournalItem(body, "- New.").body).toContain(`${comment}\n- New.\n</details>`);
    },
  );

  it("does not start a fence inside an HTML comment", () => {
    const body = CANONICAL.replace("\n</details>", "\n<!--\n```\n-->\n</details>");
    expect(appendJournalItem(body, "- New.").body).toContain("-->\n- New.\n</details>");
  });

  it("does not open a backtick fence whose info string contains a backtick", () => {
    expect(appendJournalItem(`\`\`\`bad\`info\n${CANONICAL}`, "- New.").sectionExisted).toBe(true);
  });

  it("keeps tilde fences active when their info string contains a backtick", () => {
    expect(appendJournalItem(`~~~bad\`info\n${CANONICAL}`, "- New.").sectionExisted).toBe(false);
  });
});
