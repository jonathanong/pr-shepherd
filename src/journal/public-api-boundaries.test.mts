import { describe, expect, it } from "vitest";

import { appendJournalItem, reconcileShepherdJournal } from "./index.mts";

const journal = (content: string[]) =>
  ["<details>", "<summary>Shepherd Journal</summary>", "", ...content, "</details>"].join("\n");

describe("public Shepherd Journal API boundaries", () => {
  it("recognizes the CommonMark --!> HTML comment terminator", () => {
    const live = `<!-- Sample --!>\n\n${journal(["- Kept."])}`;
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: `Updated.\n\n${journal(["- Kept."])}`,
      ok: true,
    });
    expect(appendJournalItem(live, "- New.")).toMatchObject({
      body: `<!-- Sample --!>\n\n${journal(["- Kept.", "- New."])}`,
    });
  });

  it.each([" ", "  ", "   "])(
    "ends a legacy journal before an indented H1 or H2 heading",
    (indent) => {
      for (const marker of ["#", "##"]) {
        const heading = `${indent}${marker} Next`;
        const live = `## Shepherd Journal\n\n- Kept.\n\n${heading}\n\nText.`;
        expect(appendJournalItem(live, "- New.")).toMatchObject({
          body: `${journal(["- Kept.", "- New."])}\n\n${heading}\n\nText.`,
        });
      }
    },
  );

  it("permits a CRLF body that ends after a closed fence", () => {
    const supplied = "```md\r\nSample.\r\n```\r\n";
    expect(reconcileShepherdJournal(supplied, journal(["- Kept."]))).toMatchObject({ ok: true });
  });

  it.each(["```md\nUnclosed.", "<!-- Unclosed.", "<pre>\nUnclosed."])(
    "rejects creating a journal inside an unterminated Markdown construct",
    (body) => {
      expect(() => appendJournalItem(body, "- Kept.")).toThrow(/unterminated Markdown construct/i);
    },
  );

  it.each([" ", "  ", "   "])("recognizes an indented legacy H2 journal", (indent) => {
    const live = `${indent}## Shepherd Journal\n\n- Kept.`;
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: `Updated.\n\n${live}`,
      ok: true,
    });
    expect(appendJournalItem(live, "- New.")).toMatchObject({
      body: journal(["- Kept.", "- New."]),
      sectionExisted: true,
    });
  });

  it("rejects multiple top-level items but permits nested continuation content", () => {
    expect(() => appendJournalItem("", "- First.\n- Second.")).toThrow(/exactly one/i);
    expect(appendJournalItem("", "- First.\n  More context.\n  - Nested detail.")).toMatchObject({
      body: journal(["- First.", "  More context.", "  - Nested detail."]),
    });
  });

  it.each(["- ```md", "- <pre>Evidence</pre>"])(
    "rejects an item whose content starts a Markdown block",
    (item) => {
      expect(() => appendJournalItem("", item)).toThrow(/fenced or raw HTML block/i);
    },
  );

  it.each(["Next section\n============", "Next section\n------------"])(
    "ends a legacy journal before a Setext heading",
    (heading) => {
      const live = `## Shepherd Journal\n\n- Kept.\n\n${heading}\n\nText.`;
      expect(reconcileShepherdJournal("Updated.", live)).toEqual({
        body: "Updated.\n\n## Shepherd Journal\n\n- Kept.\n",
        ok: true,
      });
      expect(appendJournalItem(live, "- New.")).toMatchObject({
        body: `${journal(["- Kept.", "- New."])}\n\n${heading}\n\nText.`,
      });
    },
  );
});
