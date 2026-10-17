import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { reconcileShepherdJournal } from "./index.mts";

const dependabot = readFileSync(new URL("./fixtures/dependabot-body.txt", import.meta.url), "utf8");
const journal = (items: string[]): string =>
  ["<details>", "<summary>Shepherd Journal</summary>", "", ...items, "</details>"].join("\n");

describe("reconcileShepherdJournal with <details> closed inside raw HTML blocks", () => {
  it("accepts a Dependabot body whose release-notes closers sit inside a raw HTML block", () => {
    const supplied = `New body\n\n${dependabot}`;
    expect(reconcileShepherdJournal(supplied, dependabot)).toEqual({ body: supplied, ok: true });
  });

  it("preserves a journal appended after a Dependabot body", () => {
    const live = `${dependabot}\n${journal(["- Keep me."])}`;
    expect(reconcileShepherdJournal("New body", live)).toEqual({
      body: `New body\n\n${journal(["- Keep me."])}`,
      ok: true,
    });
    expect(reconcileShepherdJournal(`New body\n\n${live}`, live)).toMatchObject({ ok: true });
  });

  it("counts closers that follow HTML on the same raw line", () => {
    const live = "<details>\n<summary>Notes</summary>\n<blockquote>x</blockquote></details>";
    expect(reconcileShepherdJournal("New body", live)).toEqual({ body: "New body", ok: true });
  });

  it("fails closed when a journal follows a details block still open after raw HTML", () => {
    const live = [
      "<details>",
      "<summary>Notes</summary>",
      "<p>a</p>",
      "<details>",
      "</details>",
      "",
      journal(["- Nested."]),
      "</details>",
    ].join("\n");
    expect(reconcileShepherdJournal("New body", live)).toMatchObject({ ok: false });
  });

  it("fails closed when raw HTML closes the journal container before its canonical closer", () => {
    const live = `${journal(["- Keep me.", "<p>x</p>"])}\n\n</details>`;
    expect(reconcileShepherdJournal("New body", live)).toMatchObject({ ok: false });
  });

  it.each([
    ["a comment", "<div><!-- </details> -->"],
    ["a multiline comment", "<div><!--\n</details>\n-->"],
    ["a raw-text element", "<div><script>\n</details>\n</script>"],
    ["a multiline quoted attribute", '<div title="\n</details>\n">'],
  ])("ignores closers inside %s in raw HTML", (_, raw) => {
    const live = `<details>\n<summary>Notes</summary>\n\n${raw}\n\n</details>\n\n${journal(["- Keep me."])}`;
    expect(reconcileShepherdJournal("New body", live)).toEqual({
      body: `New body\n\n${journal(["- Keep me."])}`,
      ok: true,
    });
  });

  it("keeps raw-HTML details open across the raw block's closing blank line", () => {
    const live = `<details>\n<summary>Notes</summary>\n\n<div></details><details>\n\n${journal(["- Nested."])}`;
    expect(reconcileShepherdJournal("New body", live)).toMatchObject({ ok: false });
    expect(reconcileShepherdJournal("New body", "<div></details><details>\n\nText.")).toMatchObject(
      { ok: false },
    );
  });

  it("ignores stray raw-HTML closers without an open details block", () => {
    const live = `<p>x</p>\n</details>\n\n${journal(["- Keep me."])}`;
    expect(reconcileShepherdJournal("New body", live)).toEqual({
      body: `New body\n\n${journal(["- Keep me."])}`,
      ok: true,
    });
  });
});
