import type { AuthorType, SuggestionBlock } from "../types.mts";
import type { FirstLookThread, FirstLookComment } from "../types/report.mts";
import { renderLineRange, renderSuggestionBlock } from "./suggestion-renderer.mts";
import { threadComments } from "../threads/transcript.mts";

const BODY_PREVIEW_MAX = 100;

export function renderAuthor(author: string, authorType?: AuthorType): string {
  return authorType ? `@${author} · ${authorType}` : `@${author}`;
}

export function renderBodyPreview(body: string): string {
  const normalizedBody = body.replace(/\r\n?/g, "\n");
  const firstLine = normalizedBody.split("\n")[0]?.trim() ?? "";
  return firstLine.slice(0, BODY_PREVIEW_MAX);
}

function renderFirstLookStatusTag(t: {
  autoResolved?: boolean;
  firstLookStatus: string;
  edited?: boolean;
}): string {
  const editedSuffix = t.edited ? ", edited" : "";
  return t.autoResolved
    ? `[status: outdated, auto-resolved${editedSuffix}]`
    : `[status: ${t.firstLookStatus}${editedSuffix}]`;
}

export function renderThreadResolutionStatusTag(t: {
  isOutdated?: boolean;
  isMinimized?: boolean;
}): string {
  const status = [t.isOutdated ? "outdated" : null, t.isMinimized ? "minimized" : null]
    .filter(Boolean)
    .join(", ");
  return status ? `[status: ${status}]` : "[status: unresolved]";
}

interface ThreadBulletInput {
  id: string;
  reviewId?: string;
  url?: string;
  path?: string | null;
  startLine?: number | null;
  line?: number | null;
  author: string;
  authorType?: AuthorType;
  body: string;
  comments?: Array<{
    id: string;
    author: string;
    authorType?: AuthorType;
    body: string;
    url: string;
  }>;
  suggestion?: SuggestionBlock;
  edited?: boolean;
}

export function renderThreadBullet(
  t: ThreadBulletInput,
  opts: {
    statusTag?: string;
    renderSuggestion?: boolean;
    noBody?: boolean;
    suppressEditedMarker?: boolean;
  } = {},
): string {
  const link = t.url ? ` [↗](${t.url})` : "";
  const loc = t.path
    ? `\`${t.path}:${renderLineRange(t.startLine ?? undefined, t.line ?? null)}\``
    : "`(no location)`";
  const suggestionMarker = t.suggestion ? " [suggestion]" : "";
  const editedMarker = t.edited && !opts.suppressEditedMarker ? " [edited since first look]" : "";
  const reviewMarker = t.reviewId ? ` [reviewId=${t.reviewId}]` : "";
  const statusSuffix = opts.statusTag ? ` ${opts.statusTag}` : "";
  const bulletLine = `- \`threadId=${t.id}\`${link} ${loc} (${renderAuthor(t.author, t.authorType)})${reviewMarker}${suggestionMarker}${editedMarker}${statusSuffix}`;
  if (!opts.noBody && (!t.comments || t.comments.length === 0)) {
    const legacyLine = `${bulletLine}: ${renderBodyPreview(t.body)}`;
    return t.suggestion && opts.renderSuggestion
      ? `${legacyLine}\n${renderSuggestionBlock(t.suggestion)}`
      : legacyLine;
  }
  const parts = [bulletLine];
  if (!opts.noBody) {
    parts.push(renderThreadCommentBullets(t));
  }
  if (t.suggestion && opts.renderSuggestion) {
    parts.push(renderSuggestionBlock(t.suggestion));
  }
  return parts.join("\n");
}

export function renderThreadConversation(t: ThreadBulletInput): string {
  if (!t.comments || t.comments.length === 0) return blockquote(t.body);
  return threadComments(t)
    .map((c) => {
      const heading = c.id
        ? c.url
          ? `#### [commentId=${c.id}](${c.url}) (${renderAuthor(c.author, c.authorType)})`
          : `#### \`commentId=${c.id}\` (${renderAuthor(c.author, c.authorType)})`
        : `#### (${renderAuthor(c.author, c.authorType)})`;
      return `${heading}\n\n${blockquote(c.body)}`;
    })
    .join("\n\n");
}

export function blockquote(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

function renderThreadCommentBullets(t: ThreadBulletInput): string {
  return threadComments(t)
    .map((c) => {
      const link = c.url ? ` [↗](${c.url})` : "";
      const id = c.id ? `\`commentId=${c.id}\`` : "comment";
      return [
        `  - ${id}${link} (${renderAuthor(c.author, c.authorType)})`,
        indentBlockquote(c.body, "    "),
      ].join("\n");
    })
    .join("\n");
}

function indentBlockquote(body: string, indent: string): string {
  return blockquote(body)
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

export function renderCommentBullet(
  c: { id: string; url?: string; author: string; authorType?: AuthorType; body: string },
  opts: { statusTag?: string } = {},
): string {
  const link = c.url ? ` [↗](${c.url})` : "";
  const statusSuffix = opts.statusTag ? ` ${opts.statusTag}` : "";
  return `- \`commentId=${c.id}\`${link} (${renderAuthor(c.author, c.authorType)})${statusSuffix}: ${renderBodyPreview(c.body)}`;
}

export function renderEditedCommentTag(c: { edited?: boolean }): string | undefined {
  return c.edited ? "[edited since first look]" : undefined;
}

export function renderReviewBullet(
  r: { id: string; author: string; authorType?: AuthorType; body?: string },
  opts: { includeBody?: boolean } = {},
): string {
  const bodySuffix =
    opts.includeBody && r.body != null && r.body !== "" ? `: ${renderBodyPreview(r.body)}` : "";
  return `- \`reviewId=${r.id}\` (${renderAuthor(r.author, r.authorType)})${bodySuffix}`;
}

export function renderReviewListSection(
  heading: string,
  items: { id: string; author: string; authorType?: AuthorType; body?: string }[],
): string | null {
  if (items.length === 0) return null;
  return `## ${heading}\n\n${items.map((r) => renderReviewBullet(r, { includeBody: true })).join("\n")}`;
}

/**
 * Build bullet strings for the `## First-look items` section.
 * Threads that also appear in resolutionOnlyIds have their body suppressed
 * (already shown in `## Review threads to resolve`).
 */
export function buildFirstLookBullets(
  firstLookThreads: FirstLookThread[],
  resolutionOnlyIds: Set<string>,
  firstLookComments: FirstLookComment[],
): string[] {
  const bullets: string[] = [];
  for (const t of firstLookThreads) {
    bullets.push(
      renderThreadBullet(t, {
        statusTag: renderFirstLookStatusTag(t),
        noBody: resolutionOnlyIds.has(t.id),
        suppressEditedMarker: true,
      }),
    );
  }
  for (const c of firstLookComments) {
    const editedSuffix = c.edited ? ", edited" : "";
    bullets.push(renderCommentBullet(c, { statusTag: `[status: minimized${editedSuffix}]` }));
  }
  return bullets;
}
