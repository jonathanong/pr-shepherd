const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";
// An image wrapper renders as its alt text; CodeRabbit severity icons have an empty alt.
const PICTURE_RE = /<picture>[\s\S]*?<\/picture>/g;
// A link left with no visible content after the pictures inside it are dropped.
const EMPTY_ANCHOR_RE = /<a\s[^>]*>\s*<\/a>/g;

function fenceMarker(line: string): string | null {
  const match = /^\s*(`{3,}|~{3,})/.exec(line);
  return match ? match[1]! : null;
}

function closesFence(line: string, fence: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= fence.length && [...trimmed].every((c) => c === fence[0]);
}

/** Removes `<!-- … -->` spans from `line`, carrying an open comment across lines. */
function stripComments(line: string, inComment: boolean): { text: string; inComment: boolean } {
  let text = "";
  let rest = line;
  let open = inComment;
  while (rest.length > 0) {
    if (open) {
      const end = rest.indexOf(COMMENT_CLOSE);
      if (end === -1) return { text, inComment: true };
      rest = rest.slice(end + COMMENT_CLOSE.length);
      open = false;
    } else {
      const start = rest.indexOf(COMMENT_OPEN);
      if (start === -1) return { text: text + rest, inComment: false };
      text += rest.slice(0, start);
      rest = rest.slice(start + COMMENT_OPEN.length);
      open = true;
    }
  }
  return { text, inComment: open };
}

/**
 * The visible text of a GitHub Markdown body, for Markdown output: HTML comments, `<picture>`
 * image wrappers, and links left empty by them are dropped, because GitHub does not display them.
 * Fenced code is kept verbatim. Lines emptied by the removal are dropped and blank runs collapse
 * to one; a body with no visible text is returned unchanged. JSON and `--verbose` keep the raw
 * body.
 */
export function displayBody(body: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let inComment = false;
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    if (fence) {
      out.push(raw);
      if (closesFence(raw, fence)) fence = null;
      continue;
    }
    if (!inComment) fence = fenceMarker(raw);
    if (fence) {
      out.push(raw);
      continue;
    }
    const stripped = stripComments(raw, inComment);
    inComment = stripped.inComment;
    const text = stripped.text.replace(PICTURE_RE, "").replace(EMPTY_ANCHOR_RE, "");
    if (text.trim() === "" && raw.trim() !== "") continue;
    if (text.trim() === "" && out.length > 0 && out[out.length - 1]!.trim() === "") continue;
    out.push(text.trimEnd());
  }
  while (out.length > 0 && out[0]!.trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
  // A body with no visible text (only comments) stays raw rather than rendering as nothing.
  return out.length > 0 ? out.join("\n") : body;
}
