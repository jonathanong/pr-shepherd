import { describe, expect, it } from "vitest";

import { appendJournalItem, reconcileShepherdJournal } from "./index.mts";

const journal = (content: string[]) =>
  ["<details>", "<summary>Shepherd Journal</summary>", "", ...content, "</details>"].join("\n");

describe("public Shepherd Journal API boundaries", () => {
  it("recognizes the repository-supported --!> HTML comment terminator", () => {
    const live = `<!-- Sample --!>\n\n${journal(["- Kept."])}`;
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: `Updated.\n\n${journal(["- Kept."])}`,
      ok: true,
    });
    expect(appendJournalItem(live, "- New.")).toMatchObject({
      body: `<!-- Sample --!>\n\n${journal(["- Kept.", "- New."])}`,
    });
  });

  it.each([" "])(
    "ends a legacy journal before an optionally indented top-level H1 or H2 heading",
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

  it("rejects an unrelated unclosed details container at EOF", () => {
    const supplied = "<details>\n<summary>Evidence</summary>\n\nUnclosed.";
    expect(() => appendJournalItem(supplied, "- Kept.")).toThrow(/malformed|ambiguous/i);
    expect(reconcileShepherdJournal(supplied, journal(["- Kept."]))).toMatchObject({ ok: false });
  });

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

  it.each(["## Shepherd Journal ##", "## Shepherd Journal \t### \t"])(
    "recognizes whitespace-delimited closing hashes on a legacy H2 journal",
    (heading) => {
      const live = `${heading}\n\n- Kept.`;
      expect(reconcileShepherdJournal("Updated.", live)).toEqual({
        body: `Updated.\n\n${live}`,
        ok: true,
      });
      expect(appendJournalItem(live, "- New.")).toMatchObject({
        body: journal(["- Kept.", "- New."]),
        sectionExisted: true,
      });
    },
  );

  it.each([
    "## Shepherd Journal##",
    "## Shepherd Journal ## trailing",
    "## Shepherd Journal\u00a0##",
  ])(
    "does not recognize a legacy H2 journal without an exact closing-hash boundary: %s",
    (heading) => {
      const body = `${heading}\n\n- Kept.`;
      expect(reconcileShepherdJournal("Updated.", body)).toEqual({ body: "Updated.", ok: true });
      expect(appendJournalItem(body, "- New.")).toMatchObject({
        body: `${body}\n\n${journal(["- New."])}`,
        sectionExisted: false,
      });
    },
  );

  it("rejects multiple top-level items but permits nested continuation content", () => {
    expect(() => appendJournalItem("", "- First.\n- Second.")).toThrow(/exactly one/i);
    expect(appendJournalItem("", "- First.\n  More context.\n  - Nested detail.")).toMatchObject({
      body: journal(["- First.", "  More context.", "  - Nested detail."]),
    });
  });

  it.each(["- ```md", "- <pre>Evidence</pre>", "- First.\n```md", "- First.\n<pre>"])(
    "rejects an item containing a Markdown block opener",
    (item) => {
      expect(() => appendJournalItem("", item)).toThrow(/fenced or raw HTML block/i);
    },
  );

  it.each(["#", "## Next"])(
    "ends a legacy journal before an H1 or H2 heading, including empty headings",
    (heading) => {
      const live = `## Shepherd Journal\n\n- Kept.\n\n${heading}\n\nText.`;
      expect(appendJournalItem(live, "- New.")).toMatchObject({
        body: `${journal(["- Kept.", "- New."])}\n\n${heading}\n\nText.`,
      });
    },
  );

  it("does not treat a nonbreaking space as a legacy heading delimiter", () => {
    const body = "##\u00a0Shepherd Journal\n\n- Kept.";
    expect(reconcileShepherdJournal("Updated.", body)).toEqual({ body: "Updated.", ok: true });
    expect(appendJournalItem(body, "- New.")).toMatchObject({
      body: `${body}\n\n${journal(["- New."])}`,
      sectionExisted: false,
    });
  });

  it("fails closed for adjacent duplicate legacy headings", () => {
    const body = "## Shepherd Journal\n\n- First.\n\n## Shepherd Journal\n\n- Second.";
    expect(reconcileShepherdJournal("Updated.", body)).toMatchObject({ ok: false });
    expect(() => appendJournalItem(body, "- New.")).toThrow(/malformed|duplicate|ambiguous/i);
  });

  it("keeps H3 journal subsections inside a legacy journal", () => {
    const live = "## Shepherd Journal\n\n- Kept.\n\n### Investigation\n\n- Detail.";
    expect(appendJournalItem(live, "- New.")).toMatchObject({
      body: journal(["- Kept.", "", "### Investigation", "", "- Detail.", "- New."]),
    });
  });

  it("keeps an ATX subsection followed by a thematic break inside a legacy journal", () => {
    const live = "## Shepherd Journal\n\n- Kept.\n\n### Investigation\n---\n\n- Detail.";
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: `Updated.\n\n${live}`,
      ok: true,
    });
    expect(appendJournalItem(live, "- New.")).toMatchObject({
      body: journal(["- Kept.", "", "### Investigation", "---", "", "- Detail.", "- New."]),
    });
  });

  it("keeps a nested H2 heading inside a legacy journal", () => {
    const live = "## Shepherd Journal\n\n- Kept.\n  ## Investigation\n  More context.";
    expect(appendJournalItem(live, "- New.")).toMatchObject({
      body: journal(["- Kept.", "  ## Investigation", "  More context.", "- New."]),
    });
  });

  it("preserves CRLF line endings when appending", () => {
    const body =
      "Intro.\r\n\r\n<details>\r\n<summary>Shepherd Journal</summary>\r\n\r\n- Kept.\r\n</details>";
    expect(appendJournalItem(body, "- New.").body).toBe(
      "Intro.\r\n\r\n<details>\r\n<summary>Shepherd Journal</summary>\r\n\r\n- Kept.\r\n- New.\r\n</details>",
    );
  });

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

  it("moves an entire multiline Setext heading outside a legacy journal", () => {
    const heading = "Next section\nwith context\n---";
    const live = `## Shepherd Journal\n\n- Kept.\n\n${heading}\n\nText.`;
    expect(reconcileShepherdJournal("Updated.", live)).toEqual({
      body: "Updated.\n\n## Shepherd Journal\n\n- Kept.\n",
      ok: true,
    });
    expect(appendJournalItem(live, "- New.")).toMatchObject({
      body: `${journal(["- Kept.", "- New."])}\n\n${heading}\n\nText.`,
    });
  });
});
