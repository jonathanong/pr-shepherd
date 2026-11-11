import { describe, expect, it } from "vitest";
import { displayBody } from "./display-body.mts";
import { blockquote, renderBodyPreview } from "./list-formatters.mts";

const CODERABBIT = [
  "<!-- coderabbit-ai-generated:v1 -->",
  "",
  '**<picture><img src="https://example.test/amber.svg" width="16" alt=""></picture> Minor** · **Quick win**',
  "",
  "**Describe the App routing exceptions.**",
  "",
  "<!-- ai-agent-prompt:start -->",
  "",
  "<details>",
  "",
  "```",
  "Review comment at @docs/github-api.md at line 115:",
  "```",
  "",
  "</details>",
  "",
  "<!-- ai-agent-prompt:end -->",
  "",
  "<!-- cr-comment:v1:fc9d -->",
  "",
  "✅ Addressed in commit 9d5e53e",
].join("\n");

describe("displayBody", () => {
  it("drops comments and image wrappers, keeps visible text and fences, collapses blanks", () => {
    expect(displayBody(CODERABBIT)).toBe(
      [
        "** Minor** · **Quick win**",
        "",
        "**Describe the App routing exceptions.**",
        "",
        "<details>",
        "",
        "```",
        "Review comment at @docs/github-api.md at line 115:",
        "```",
        "",
        "</details>",
        "",
        "✅ Addressed in commit 9d5e53e",
      ].join("\n"),
    );
  });

  it("removes multi-line comments and inline comments mid-line", () => {
    expect(displayBody("keep <!-- a --> this\n<!-- start\nhidden\n--> tail\nlast")).toBe(
      "keep  this\n tail\nlast",
    );
  });

  it("keeps comment syntax inside backtick and tilde fences verbatim", () => {
    const body = "```html\n<!-- shown -->\n~~~\n```\n~~~~\n<!-- also -->\n~~~~\nafter";
    expect(displayBody(body)).toBe(body);
  });

  it("drops links emptied by removed pictures and normalizes CRLF", () => {
    expect(
      displayBody('<a href="https://x.test"><picture><img alt=""></picture></a>\r\nExplain\r\n'),
    ).toBe("Explain");
  });

  it("keeps comment syntax in inline code spans, including unclosed backtick runs", () => {
    expect(displayBody("Replace `<!-- old -->` with ``<!-- new -->`` <!-- hidden -->now")).toBe(
      "Replace `<!-- old -->` with ``<!-- new -->`` now",
    );
    expect(displayBody("a ``x` <!-- gone --> b")).toBe("a ``x`  b");
    // A longer backtick run inside the span does not close it.
    expect(displayBody("``a ``` <!-- kept --> b`` <!-- gone -->")).toBe(
      "``a ``` <!-- kept --> b``",
    );
  });

  it("keeps an unclosed comment opener and the text after it", () => {
    expect(displayBody("Use `<!--` to start a comment.\nThen <!-- and keep\nthis")).toBe(
      "Use `<!--` to start a comment.\nThen <!-- and keep\nthis",
    );
  });

  it("keeps indented code blocks verbatim but not indented paragraph continuations", () => {
    const body = "Example:\n\n    <!-- literal -->\n\n    <!-- second -->\ntext\n    <!-- gone -->";
    expect(displayBody(body)).toBe("Example:\n\n    <!-- literal -->\n\n    <!-- second -->\ntext");
    expect(displayBody("\t<!-- tab code -->")).toBe("\t<!-- tab code -->");
  });

  it("returns the raw body when nothing visible remains", () => {
    expect(displayBody("<!-- pr-shepherd -->")).toBe("<!-- pr-shepherd -->");
    expect(displayBody("")).toBe("");
  });

  it("applies to capped blockquotes and previews, not to uncapped blockquotes", () => {
    expect(blockquote("<!-- m -->\ntext", 1200)).toBe("> text");
    expect(blockquote("<!-- m -->\ntext")).toBe("> <!-- m -->\n> text");
    expect(renderBodyPreview("<!-- m -->\n\nFirst visible line")).toBe("First visible line");
  });
});
