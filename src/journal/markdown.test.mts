import { describe, expect, it } from "vitest";

import {
  fenceStart,
  markdownContainer,
  resolveMarkdownContainer,
  stripMarkdownContainer,
} from "./markdown-container.mts";
import { inQuotedHtmlAttribute, rawHtmlStart } from "./markdown-html.mts";
import { scanMarkdownLines } from "./markdown-line.mts";
import { isIndentedCode, structuralDetailsStart } from "./markdown-structure.mts";
import { reconcileShepherdJournal } from "./reconcile.mts";

describe("Markdown container parsing", () => {
  it("parses quote and list containers with ordinary and excess padding", () => {
    expect(markdownContainer("> - item")).toMatchObject({
      content: "item",
      indent: 0,
      tokens: [{ kind: "quote" }, { kind: "list", width: 2 }],
    });
    expect(markdownContainer("-     code")).toMatchObject({ content: "    code", indent: 0 });
    expect(markdownContainer("-\t  code")).toMatchObject({ content: "  code", indent: 2 });
  });

  it("retains valid continuations, falls back after a container ends, and handles blank list lines", () => {
    const active = markdownContainer("> - item").tokens;
    expect(resolveMarkdownContainer(">   continuation", active)).toMatchObject({
      content: "continuation",
      tokens: active,
    });
    expect(resolveMarkdownContainer("new paragraph", active)).toMatchObject({
      content: "new paragraph",
      tokens: [],
    });
    expect(stripMarkdownContainer("", [{ kind: "list", width: 2 }])).toBe("");
    expect(stripMarkdownContainer("bad", [{ kind: "quote" }])).toBeNull();
    expect(stripMarkdownContainer("x", [{ kind: "list", width: 2 }])).toBeNull();
  });

  it("recognizes safe fences but rejects a backtick fence with a backtick info string", () => {
    expect(fenceStart("```ts")).toMatchObject({ length: 3, marker: "`" });
    expect(fenceStart("~~~info")).toMatchObject({ length: 3, marker: "~" });
    expect(fenceStart("```bad`info")).toBeNull();
  });
});

describe("Markdown HTML and structure parsing", () => {
  it("recognizes raw HTML blocks only in structural positions", () => {
    expect(rawHtmlStart('<pre class="sample">')).toMatchObject({ tag: "pre" });
    expect(rawHtmlStart("  <script>")).toMatchObject({ tag: "script" });
    expect(rawHtmlStart("text <pre>")).toBeNull();
    expect(rawHtmlStart("<widget>"))?.toMatchObject({ kind: "blank-line" });
    expect(rawHtmlStart("<details>")).toBeNull();
  });

  it("distinguishes quoted HTML attributes from normal tags", () => {
    expect(inQuotedHtmlAttribute('<span title="<!-- literal">', 15)).toBe(true);
    expect(inQuotedHtmlAttribute("<span> <!--", 8)).toBe(false);
    expect(inQuotedHtmlAttribute("plain text", 4)).toBe(false);
  });

  it("recognizes indented code and structural details list markers", () => {
    expect(isIndentedCode("    code")).toBe(true);
    expect(isIndentedCode("\tcode")).toBe(true);
    expect(isIndentedCode("   prose")).toBe(false);
    expect(structuralDetailsStart("  <details open>")).toBe(2);
    expect(structuralDetailsStart("<details/>")).toBe(0);
    expect(structuralDetailsStart("<details />")).toBe(0);
    expect(structuralDetailsStart("</details/>")).toBeNull();
    expect(structuralDetailsStart("-\t<details>")).not.toBeNull();
    expect(structuralDetailsStart("-     <details>")).toBeNull();
    expect(structuralDetailsStart("    <details>")).toBeNull();
  });
});

describe("Markdown scanner masking", () => {
  it("masks fenced blocks, indented code, comments, raw HTML, and matching inline code spans", () => {
    const lines = scanMarkdownLines([
      "```html",
      "<!-- hidden -->",
      "```",
      "    <details>",
      "<!-- hidden",
      "-->",
      "<pre>",
      "<details>",
      "</pre> visible",
      "`<!-- literal` visible",
    ]);
    expect(lines[9]).toMatchObject({
      ignored: false,
      visiblePrefix: expect.stringContaining("visible"),
    });
  });

  it("masks CommonMark type-7 raw HTML through its first blank line", () => {
    const lines = scanMarkdownLines([
      "<widget>",
      "<details>",
      "<summary>Shepherd Journal</summary>",
      "",
      "Visible",
    ]);
    expect(lines.slice(0, 4).every((line) => line.ignored)).toBe(true);
    expect(lines[4]).toMatchObject({ ignored: false, visiblePrefix: "Visible" });
  });

  it("keeps container fences and comments bounded when their container ends", () => {
    const lines = scanMarkdownLines(["- ```html", "  <!--", "  ````", "<details>"]);
    expect(lines[3]).toMatchObject({ ignored: false, visiblePrefix: "<details>" });
    const comments = scanMarkdownLines(["> <!--", "<details>"]);
    expect(comments[1]).toMatchObject({ ignored: false, visiblePrefix: "<details>" });
  });

  it("does not treat escaped or attribute-contained comment openers as comments", () => {
    const lines = scanMarkdownLines(["\\<!-- visible", '<span title="<!-- literal">', "<details>"]);
    expect(lines[0]!.ignored).toBe(false);
    expect(lines[2]).toMatchObject({ ignored: false, visiblePrefix: "<details>" });
  });

  it("handles inline code spans, unmatched spans, and code openers in quoted attributes", () => {
    const matched = scanMarkdownLines(["`code` visible"]);
    expect(matched[0]).toMatchObject({
      ignored: false,
      visiblePrefix: expect.stringContaining("visible"),
    });
    expect(scanMarkdownLines(["`unmatched", "## boundary"])[1]).toMatchObject({
      ignored: false,
      visiblePrefix: "## boundary",
    });
    expect(scanMarkdownLines(['<span title="`"> `code`'])[0]!.ignored).toBe(false);
  });

  it("scans quoted backtick runs without repeatedly traversing the attribute prefix", () => {
    const line = `<span title="${"` ".repeat(5_000)}"> visible`;
    expect(scanMarkdownLines([line])[0]).toMatchObject({ ignored: false });
  });

  it("does not carry an unmatched inline code span across a new list item", () => {
    expect(scanMarkdownLines(["- `unmatched", "- `separate entry"])[1]).toMatchObject({
      ignored: false,
      visiblePrefix: "- `separate entry",
    });
  });

  it("keeps list-contained indented code and detects inline raw HTML closures", () => {
    const indented = scanMarkdownLines(["-     code", "  continued code", "visible"]);
    expect(indented[0]!.ignored).toBe(true);
    expect(indented[1]!.ignored).toBe(true);
    expect(indented[2]).toMatchObject({ ignored: false, visiblePrefix: "visible" });
    expect(scanMarkdownLines(["<pre></pre> visible"])[0]).toMatchObject({
      ignored: true,
      visiblePrefix: expect.stringContaining("visible"),
    });
  });

  it("ends an inline HTML comment at its paragraph boundary", () => {
    expect(
      scanMarkdownLines([
        "Sample <!-- unfinished",
        "",
        "<details>",
        "<summary>Shepherd Journal</summary>",
      ]),
    ).toMatchObject([
      { ignored: false },
      { ignored: true },
      { ignored: false, visiblePrefix: "<details>" },
      { ignored: false, visiblePrefix: "<summary>Shepherd Journal</summary>" },
    ]);
  });

  it("ends a list-contained raw HTML block when its list container ends", () => {
    expect(scanMarkdownLines(["- Sample", "  <pre>", "outside list", "<details>"])).toMatchObject([
      { ignored: false, nested: true },
      { ignored: true, nested: true },
      { ignored: false, nested: false, visiblePrefix: "outside list" },
      { ignored: false, nested: false, visiblePrefix: "<details>" },
    ]);
  });
});

describe("reconciliation parser edge cases", () => {
  it("fails closed for an unterminated canonical block", () => {
    expect(
      reconcileShepherdJournal("<details>\n<summary>Shepherd Journal</summary>\n\n- Kept.", ""),
    ).toMatchObject({ ok: false });
  });

  it("treats a self-closing details tag as an unclosed non-void details container", () => {
    expect(reconcileShepherdJournal("<details/>", "")).toMatchObject({ ok: false });
  });

  it("balances unrelated nested details without creating a journal", () => {
    const body =
      "<details>\n<summary>Evidence</summary>\n\n<details>\nText\n</details>\n</details>";
    expect(reconcileShepherdJournal(body, "")).toEqual({ body, ok: true });
  });
});
