const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";
const PICTURE_RE = /<picture>[\s\S]*?<\/picture>/g;
const IMG_RE = /<img\s[^>]*>/;
// A link left with no visible content after the pictures inside it are dropped.
const EMPTY_ANCHOR_RE = /<a\s[^>]*>\s*<\/a>/g;

function fenceMarker(line: string): string | null {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  return match ? match[1]! : null;
}

function closesFence(line: string, fence: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= fence.length && [...trimmed].every((c) => c === fence[0]);
}

const isIndented = (line: string) => /^(?: {4}|\t)/.test(line);
// Blockquote and list markers are containers: code inside a quote or list item is still code.
const containerContent = (line: string) =>
  line.replace(/^(?: {0,3}(?:> ?|(?:[-*+]|\d{1,9}[.)])(?: |$)))+/, "");

const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/**
 * A `<picture>` as Markdown image text. An image whose `alt` is explicitly empty is decorative
 * (CodeRabbit's severity icons) and is dropped; any other keeps its alt text and source.
 */
function pictureText(picture: string): string {
  const img = IMG_RE.exec(picture)?.[0];
  if (img === undefined) return "";
  const alt = attribute(img, "alt");
  if (alt === "") return "";
  const src = attribute(img, "src");
  return src === undefined ? (alt ?? "") : `![${alt ?? ""}](${src})`;
}
const isBlank = (line: string) => line.trim() === "";

/**
 * Marks lines GitHub renders as code: fenced blocks and indented blocks (which start after a
 * blank line and continue through indented or blank lines).
 */
function codeLines(lines: string[]): boolean[] {
  const code: boolean[] = [];
  let fence: string | null = null;
  let indented = false;
  const content = lines.map(containerContent);
  for (let i = 0; i < content.length; i++) {
    const line = content[i]!;
    if (fence) {
      code.push(true);
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    fence = fenceMarker(line);
    // A blank line ends `indented`, but the next indented line restarts it (blank line before).
    indented = isIndented(line) && (indented || i === 0 || isBlank(content[i - 1]!));
    code.push(fence !== null || (indented && !isBlank(line)));
  }
  return code;
}

/** Index just past the inline code span opening at `i`, or -1 when its backticks never close. */
function codeSpanEnd(text: string, i: number): number {
  let n = 0;
  while (text[i + n] === "`") n++;
  const run = "`".repeat(n);
  let at = text.indexOf(run, i + n);
  while (at !== -1) {
    let len = 0;
    while (text[at + len] === "`") len++;
    if (len === n) return at + n;
    at = text.indexOf(run, at + len);
  }
  return -1;
}

const dropImageMarkup = (text: string) =>
  text.replace(PICTURE_RE, pictureText).replace(EMPTY_ANCHOR_RE, "");

/**
 * Removes closed `<!-- … -->` comments, `<picture>` wrappers, and links left empty, all outside
 * inline code spans; unclosed comment openers stay literal.
 */
function stripHiddenMarkup(text: string): string {
  let out = "";
  let plain = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      let n = 0;
      while (text[i + n] === "`") n++;
      const end = codeSpanEnd(text, i);
      const next = end === -1 ? i + n : end;
      if (end === -1) {
        plain += text.slice(i, next);
      } else {
        out += dropImageMarkup(plain) + text.slice(i, next);
        plain = "";
      }
      i = next;
      continue;
    }
    if (text.startsWith(COMMENT_OPEN, i)) {
      const close = text.indexOf(COMMENT_CLOSE, i + COMMENT_OPEN.length);
      if (close !== -1) {
        i = close + COMMENT_CLOSE.length;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  return out + dropImageMarkup(plain);
}

/** Strips one run of non-code lines and returns its lines. */
function visibleLines(run: string[]): string[] {
  return stripHiddenMarkup(run.join("\n"))
    .split("\n")
    .map((line) => line.trimEnd());
}

/**
 * The visible text of a GitHub Markdown body, for Markdown output: closed HTML comments,
 * `<picture>` image wrappers, and links left empty by them are dropped, because GitHub does not
 * display them. Fenced and indented code and inline code spans are kept verbatim. Blank runs
 * collapse to one; a body with no visible text is returned unchanged. JSON and `--verbose` keep
 * the raw body.
 */
export function displayBody(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const code = codeLines(lines);
  const out: string[] = [];
  const push = (line: string) => {
    if (isBlank(line) && (out.length === 0 || isBlank(out[out.length - 1]!))) return;
    out.push(line);
  };
  let run: string[] = [];
  const flush = () => {
    if (run.length === 0) return;
    for (const line of visibleLines(run)) push(line);
    run = [];
  };
  lines.forEach((line, i) => {
    if (code[i]) {
      flush();
      out.push(line);
    } else {
      run.push(line);
    }
  });
  flush();
  while (out.length > 0 && isBlank(out[out.length - 1]!)) out.pop();
  // A body with no visible text (only comments) stays raw rather than rendering as nothing.
  return out.length > 0 ? out.join("\n") : body;
}
