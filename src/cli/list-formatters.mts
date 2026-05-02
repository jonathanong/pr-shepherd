import type { SuggestionBlock } from "../types.mts";
import { renderLineRange, renderSuggestionBlock } from "./suggestion-renderer.mts";

const BODY_PREVIEW_MAX = 100;

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
  body: string;
  suggestion?: SuggestionBlock;
}

export function renderThreadBullet(
  t: ThreadBulletInput,
  opts: { statusTag?: string; renderSuggestion?: boolean } = {},
): string {
  const link = t.url ? ` [↗](${t.url})` : "";
  const loc = t.path
    ? `\`${t.path}:${renderLineRange(t.startLine ?? undefined, t.line ?? null)}\``
    : "`(no location)`";
  const suggestionMarker = t.suggestion ? " [suggestion]" : "";
  const statusSuffix = opts.statusTag ? ` ${opts.statusTag}` : "";
  const bulletLine = `- \`threadId=${t.id}\`${link} ${loc} (@${t.author})${suggestionMarker}${statusSuffix}: ${renderBodyPreview(t.body)}`;
  if (t.suggestion && opts.renderSuggestion) {
    return `${bulletLine}\n${renderSuggestionBlock(t.suggestion)}`;
  }
  return bulletLine;
}

export function renderCommentBullet(
  c: { id: string; url?: string; author: string; body: string },
  opts: { statusTag?: string } = {},
): string {
  const link = c.url ? ` [↗](${c.url})` : "";
  const statusSuffix = opts.statusTag ? ` ${opts.statusTag}` : "";
  return `- \`commentId=${c.id}\`${link} (@${c.author})${statusSuffix}: ${renderBodyPreview(c.body)}`;
}

export function renderReviewBullet(
  r: { id: string; author: string; body?: string },
  opts: { includeBody?: boolean } = {},
): string {
  const bodySuffix =
    opts.includeBody && r.body != null && r.body !== "" ? `: ${renderBodyPreview(r.body)}` : "";
  return `- \`reviewId=${r.id}\` (@${r.author})${bodySuffix}`;
}

export function renderReviewListSection(
  heading: string,
  items: { id: string; author: string; body?: string }[],
): string | null {
  if (items.length === 0) return null;
  return `## ${heading}\n\n${items.map((r) => renderReviewBullet(r, { includeBody: true })).join("\n")}`;
}
