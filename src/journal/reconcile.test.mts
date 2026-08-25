import { describe, expect, it } from "vitest";

import { reconcileShepherdJournal } from "./index.mts";

const journal = (items: string[]): string =>
  ["<details>", "<summary>Shepherd Journal</summary>", "", ...items, "</details>"].join("\n");

describe("reconcileShepherdJournal", () => {
  it("splices an omitted live legacy journal verbatim", () => {
    const live = "## Summary\n\nOld.\n\n## Shepherd Journal\n\n- Keep me.\n\n## Next\n\nText.";
    expect(reconcileShepherdJournal("## Summary\n\nNew.", live)).toEqual({
      body: "## Summary\n\nNew.\n\n## Shepherd Journal\n\n- Keep me.\n",
      ok: true,
    });
  });

  it("permits a supplied journal extended with a new entry", () => {
    const live = journal(["- Keep me."]);
    const supplied = journal(["- Keep me.", "- New entry."]);
    expect(reconcileShepherdJournal(supplied, live)).toEqual({ body: supplied, ok: true });
  });

  it("fails closed when an existing entry is dropped or changed", () => {
    const result = reconcileShepherdJournal(journal(["- Changed."]), journal(["- Keep me."]));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("Keep me");
  });

  it("preserves duplicate live entries only when every duplicate survives", () => {
    const live = journal(["- Keep me.", "- Keep me."]);
    expect(reconcileShepherdJournal(journal(["- Keep me."]), live)).toMatchObject({ ok: false });
    expect(reconcileShepherdJournal(live, live)).toEqual({ body: live, ok: true });
  });

  it("supports legacy-to-canonical migration but rejects canonical downgrade", () => {
    expect(
      reconcileShepherdJournal(journal(["- Keep me."]), "## Shepherd Journal\n\n- Keep me."),
    ).toMatchObject({ ok: true });
    expect(
      reconcileShepherdJournal("## Shepherd Journal\n\n- Keep me.", journal(["- Keep me."])),
    ).toMatchObject({
      error: expect.stringMatching(/downgrade/i),
      ok: false,
    });
  });

  it.each([
    "<details>\n<summary>Shepherd Journal</summary>\n- Missing blank line.\n</details>",
    `${journal(["- One."])}\n\n${journal(["- Two."])}`,
    `${journal(["- One."])}\n\n## Shepherd Journal\n\n- Two.`,
    "Text.\n</details>",
  ])("fails closed for malformed or ambiguous containers", (body) => {
    expect(reconcileShepherdJournal(body, "")).toMatchObject({ ok: false });
  });

  it("ignores fenced, commented, and raw-HTML journal lookalikes", () => {
    const hidden = [
      "```html",
      "<details>",
      "<summary>Shepherd Journal</summary>",
      "",
      "- Hidden.",
      "</details>",
      "```",
      "<!--",
      journal(["- Also hidden."]),
      "-->",
      "<pre>",
      journal(["- Hidden HTML."]),
      "</pre>",
    ].join("\n");
    expect(reconcileShepherdJournal("## Summary\n\nNew.", hidden)).toEqual({
      body: "## Summary\n\nNew.",
      ok: true,
    });
  });

  it("finds a visible canonical journal following masked samples", () => {
    const live = `\`\`\`\n## Shepherd Journal\n\`\`\`\n\n${journal(["- Visible."])}`;
    expect(reconcileShepherdJournal("## Summary\n\nNew.", live)).toEqual({
      body: `## Summary\n\nNew.\n\n${journal(["- Visible."])}`,
      ok: true,
    });
  });

  it("handles nested details and list containers without treating them as journal boundaries", () => {
    const live = journal([
      "- Keep me.",
      "- <details>",
      "  <summary>Evidence</summary>",
      "  </details>",
    ]);
    expect(reconcileShepherdJournal("## Summary\n\nNew.", live)).toEqual({
      body: `## Summary\n\nNew.\n\n${live}`,
      ok: true,
    });
  });

  it("does not count fenced bullets as preserved entries", () => {
    const live = journal(["- Keep me."]);
    const supplied = journal(["- Other.", "```", "- Keep me.", "```"]);
    expect(reconcileShepherdJournal(supplied, live)).toMatchObject({ ok: false });
  });

  it("preserves CRLF bodies exactly when accepted and splices the live bytes", () => {
    const live = journal(["- Keep me."]).replaceAll("\n", "\r\n");
    expect(reconcileShepherdJournal(live, live)).toEqual({ body: live, ok: true });
    expect(reconcileShepherdJournal("## Summary\r\n\r\nNew.", live)).toEqual({
      body: `## Summary\r\n\r\nNew.\n\n${live}`,
      ok: true,
    });
  });

  it("does not leave an orphaned CR when splicing a bounded CRLF journal", () => {
    const live = ["## Shepherd Journal", "", "- Keep me.", "", "## Next", "", "Text."].join("\r\n");
    expect(reconcileShepherdJournal("## Summary\r\n\r\nNew.", live)).toEqual({
      body: "## Summary\r\n\r\nNew.\n\n## Shepherd Journal\r\n\r\n- Keep me.\r\n\r\n",
      ok: true,
    });
  });
});
