import { describe, expect, it } from "vitest";

import { extractShepherdJournal } from "./index.mts";

const journal = (content: string[]): string =>
  ["<details>", "<summary>Shepherd Journal</summary>", "", ...content, "</details>"].join("\n");

describe("extractShepherdJournal", () => {
  it("returns null when no visible structural journal exists", () => {
    const body = [
      "```md",
      journal(["- Fenced."]),
      "```",
      "<!--",
      journal(["- Commented."]),
      "-->",
      "> <details>",
      "> <summary>Shepherd Journal</summary>",
      ">",
      "> - Quoted.",
      "> </details>",
      "- <details>",
      "  <summary>Shepherd Journal</summary>",
      "",
      "  - List nested.",
      "  </details>",
    ].join("\n");

    expect(extractShepherdJournal(body)).toEqual({ journal: null, ok: true });
  });

  it("extracts canonical entries in order without deduplicating them", () => {
    const body = journal(["- First.  ", "  Continued.", "", "- Duplicate.", "- Duplicate."]);

    expect(extractShepherdJournal(body)).toEqual({
      journal: {
        entries: ["- First.  \n  Continued.", "- Duplicate.", "- Duplicate."],
        format: "details",
      },
      ok: true,
    });
  });

  it("extracts a bounded legacy journal and normalizes CRLF entries", () => {
    const body = [
      "## Shepherd Journal",
      "",
      "- Kept.",
      "  Context.",
      "",
      "## Next",
      "",
      "Text.",
    ].join("\r\n");

    expect(extractShepherdJournal(body)).toEqual({
      journal: { entries: ["- Kept.\n  Context."], format: "legacy" },
      ok: true,
    });
  });

  it.each([journal([]), "## Shepherd Journal\n"])(
    "returns an empty entry list for an empty journal",
    (body) => {
      expect(extractShepherdJournal(body)).toMatchObject({
        journal: { entries: [] },
        ok: true,
      });
    },
  );

  it.each([
    "<details>\n<summary>Shepherd Journal</summary>\n- Missing separator.\n</details>",
    "<details>\n<summary>Shepherd Journal</summary>\n\n- Unclosed.",
    `${journal(["- One."])}\n\n${journal(["- Two."])}`,
    `${journal(["- One."])}\n\n## Shepherd Journal\n\n- Two.`,
    `<details>\n<summary>Evidence</summary>\n\n${journal(["- Nested."])}\n</details>`,
    "<details>\n<summary>Evidence</summary>\n\n## Shepherd Journal\n\n- Nested.\n</details>",
  ])("fails closed for malformed, duplicate, mixed, or nested journals", (body) => {
    expect(extractShepherdJournal(body)).toMatchObject({
      error: expect.stringMatching(/malformed|duplicate|ambiguous/i),
      ok: false,
    });
  });

  it.each([journal(["Narrative only."]), journal(["Narrative first.", "", "- Entry."])])(
    "fails closed for unrecognized entry content",
    (body) => {
      expect(extractShepherdJournal(body)).toMatchObject({
        error: expect.stringMatching(/unrecognized entry format/i),
        ok: false,
      });
    },
  );
});
