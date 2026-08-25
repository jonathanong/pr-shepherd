import { describe, expect, it } from "vitest";

import { appendJournalItem, reconcileShepherdJournal } from "./index.mts";
import { rawHtmlEnd, rawHtmlStart } from "./markdown-html.mts";

const journal = (content: string[]) =>
  ["<details>", "<summary>Shepherd Journal</summary>", "", ...content, "</details>"].join("\n");

describe("public Shepherd Journal API", () => {
  it.each(["div", "table", "section", "address", "blockquote", "ol"])(
    "ignores a journal-shaped sample in a CommonMark <%s> raw HTML block",
    (tag) => {
      const hidden = `<${tag}>\n${journal(["- Hidden."])}\n\n</${tag}>`;
      expect(reconcileShepherdJournal("Updated.", hidden)).toEqual({ body: "Updated.", ok: true });
    },
  );

  it("still recognizes a structural top-level details journal", () => {
    const live = journal(["- Kept."]);
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: `Updated.\n\n${live}`,
      ok: true,
    });
  });

  it("ends a legacy journal at a tab-delimited ATX heading", () => {
    const live = "## Shepherd Journal\n\n- Kept.\n\n##\tNext\n\nText.";
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: "Updated.\n\n## Shepherd Journal\n\n- Kept.\n",
      ok: true,
    });
  });

  it("preserves supplied trailing whitespace while appending an omitted live journal", () => {
    const supplied = "Updated.  \n\t";
    expect(reconcileShepherdJournal(supplied, journal(["- Kept."]))).toEqual({
      body: `${supplied}\n\n${journal(["- Kept."])}`,
      ok: true,
    });
  });

  it("shares scanner behavior with appendJournalItem", () => {
    const body = `<div>\n${journal(["- Hidden."])}\n\n</div>\n\n${journal(["- Kept."])}`;
    const reconciled = reconcileShepherdJournal(body, body);
    expect(reconciled).toEqual({ body, ok: true });
    expect(appendJournalItem(body, "- New.")).toMatchObject({
      body: expect.stringContaining("- Kept.\n- New."),
      sectionExisted: true,
    });
  });

  it("does not count a details-looking quoted attribute as a nested closing tag", () => {
    const live = journal(["- Kept.", '- <details title="</details>">', "  </details>"]);
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: `Updated.\n\n${live}`,
      ok: true,
    });
  });

  it("fails closed when supplied content would replace unrecognized live journal content", () => {
    const live = journal(["Narrative content without a list item."]);
    expect(reconcileShepherdJournal(journal(["- Replacement."]), live)).toMatchObject({
      error: expect.stringMatching(/unrecognized entry format/i),
      ok: false,
    });
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: `Updated.\n\n${live}`,
      ok: true,
    });
  });

  it("creates, appends, and deduplicates canonical containers", () => {
    expect(appendJournalItem("", "- First.")).toEqual({
      body: journal(["- First."]),
      mutated: true,
      sectionExisted: false,
    });
    const existing = `Summary\n\n${journal(["- First."])}`;
    expect(appendJournalItem(existing, "- Second.")).toEqual({
      body: `Summary\n\n${journal(["- First.", "- Second."])}`,
      mutated: true,
      sectionExisted: true,
    });
    expect(appendJournalItem(existing, "- First.")).toEqual({
      body: existing,
      mutated: false,
      sectionExisted: true,
    });
  });

  it("migrates legacy containers while retaining their entries", () => {
    expect(appendJournalItem("## Shepherd Journal\n\n- First.", "- Second.")).toEqual({
      body: journal(["- First.", "- Second."]),
      mutated: true,
      sectionExisted: true,
    });
    expect(appendJournalItem("## Shepherd Journal\n\n- First.", "- First.")).toEqual({
      body: journal(["- First."]),
      mutated: true,
      sectionExisted: true,
    });
  });

  it("rejects ambiguous public append bodies", () => {
    expect(() =>
      appendJournalItem(`${journal(["- One."])}\n\n## Shepherd Journal\n\n- Two.`, "- New."),
    ).toThrow(/ambiguous/i);
  });

  it("recognizes all raw HTML termination strategies", () => {
    const tag = rawHtmlStart("<div>");
    const declaration = rawHtmlStart("<!DOCTYPE html>");
    const processing = rawHtmlStart("<?php");
    const cdata = rawHtmlStart("<![CDATA[");
    expect(tag && rawHtmlEnd(tag, "</div> trailing")).toBe(6);
    expect(declaration && rawHtmlEnd(declaration, "")).toBe(0);
    expect(processing && rawHtmlEnd(processing, "?> trailing")).toBe(2);
    expect(cdata && rawHtmlEnd(cdata, "]]>")).toBe(3);
  });
});
