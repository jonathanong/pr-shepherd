import type { AuthorType, SuggestionBlock } from "../types.mts";
import type { FirstLookThread, FirstLookComment } from "../types/report.mts";
import { renderLineRange, renderSuggestionBlock } from "./suggestion-renderer.mts";

const BODY_PREVIEW_MAX = 100;

export function renderAuthor(author: string, authorType?: AuthorType): string {
  return authorType ? `@${author} · ${authorType}` : `@${author}`;
}

export function renderBodyPreview(body: string): string {
  const normalizedBody = body.replace(/\r\n?/g, "\n");
  const firstLine = normalizedBody.split("\n")[0]?.trim() ?? "";
  return firstLine.slice(0, BODY_PREVIEW_MAX);
}

export function renderFirstLookStatusTag(t: {
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
  url?: string;
  path?: string | null;
  startLine?: number | null;
  line?: number | null;
  author: string;
  authorType?: AuthorType;
  body: string;
  suggestion?: SuggestionBlock;
}

export function renderThreadBullet(
  t: ThreadBulletInput,
  opts: { statusTag?: string; renderSuggestion?: boolean; noBody?: boolean } = {},
): string {
  const link = t.url ? ` [↗](${t.url})` : "";
  const loc = t.path
    ? `\`${t.path}:${renderLineRange(t.startLine ?? undefined, t.line ?? null)}\``
    : "`(no location)`";
  const suggestionMarker = t.suggestion ? " [suggestion]" : "";
  const statusSuffix = opts.statusTag ? ` ${opts.statusTag}` : "";
  const bodySuffix = opts.noBody ? "" : `: ${renderBodyPreview(t.body)}`;
  const bulletLine = `- \`threadId=${t.id}\`${link} ${loc} (${renderAuthor(t.author, t.authorType)})${suggestionMarker}${statusSuffix}${bodySuffix}`;
  if (t.suggestion && opts.renderSuggestion) {
    return `${bulletLine}\n${renderSuggestionBlock(t.suggestion)}`;
  }
  return bulletLine;
}

export function renderCommentBullet(
  c: { id: string; url?: string; author: string; authorType?: AuthorType; body: string },
  opts: { statusTag?: string } = {},
): string {
  const link = c.url ? ` [↗](${c.url})` : "";
  const statusSuffix = opts.statusTag ? ` ${opts.statusTag}` : "";
  return `- \`commentId=${c.id}\`${link} (${renderAuthor(c.author, c.authorType)})${statusSuffix}: ${renderBodyPreview(c.body)}`;
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
      }),
    );
  }
  for (const c of firstLookComments) {
    const editedSuffix = c.edited ? ", edited" : "";
    bullets.push(renderCommentBullet(c, { statusTag: `[status: minimized${editedSuffix}]` }));
  }
  return bullets;
}
