import { describe, expect, it } from "vitest";

import { reconcileShepherdJournal } from "./index.mts";
import { rawHtmlEnd, rawHtmlStart } from "./markdown-html.mts";

const journal = (content: string[]) =>
  ["<details>", "<summary>Shepherd Journal</summary>", "", ...content, "</details>"].join("\n");

describe("CommonMark type-6 HTML blocks", () => {
  it("recognizes all raw HTML termination strategies", () => {
    const tag = rawHtmlStart("<pre>");
    const declaration = rawHtmlStart("<!DOCTYPE html>");
    const processing = rawHtmlStart("<?php");
    const cdata = rawHtmlStart("<![CDATA[");
    expect(tag && rawHtmlEnd(tag, "</pre> trailing")).toBe(6);
    expect(declaration && rawHtmlEnd(declaration, "<!DOCTYPE html>")).toBe(15);
    expect(processing && rawHtmlEnd(processing, "?> trailing")).toBe(2);
    expect(cdata && rawHtmlEnd(cdata, "]]>")).toBe(3);
    expect(rawHtmlStart("<![cdata[")).toBeNull();
  });

  it.each(["frame", "frameset", "noframes", "optgroup", "option", "param"])(
    "masks a <%s> raw HTML block through its first blank line",
    (tag) => {
      const live = `<${tag} name=x\n<details>\n<summary>Shepherd Journal</summary>\n\n${journal(["- Kept."])}`;
      expect(reconcileShepherdJournal("Updated.", live)).toEqual({
        body: `Updated.\n\n${journal(["- Kept."])}`,
        ok: true,
      });
    },
  );

  it.each(["pre", "script", "style", "textarea"])(
    "requires an exact </%s> terminator before exposing following journal-shaped text",
    (tag) => {
      const block = rawHtmlStart(`<${tag}>`);
      expect(block && rawHtmlEnd(block, `</${tag} >`)).toBeNull();
      const hidden = `<${tag}>\n</${tag} >\n${journal(["- Hidden."])}`;
      expect(reconcileShepherdJournal("Updated.", hidden)).toEqual({ body: "Updated.", ok: true });
    },
  );
});
