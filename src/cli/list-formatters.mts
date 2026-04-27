import type { SuggestionBlock } from "../types.mts";
import { renderLineRange, renderSuggestionBlock } from "./suggestion-renderer.mts";

const BODY_PREVIEW_MAX = 100;

export function renderBodyPreview(body: string): string {
  return body.split("\n")[0]?.slice(0, BODY_PREVIEW_MAX) ?? "";
}

export function renderFirstLookStatusTag(t: {
  autoResolved?: boolean;
  firstLookStatus: string;
}): string {
  return t.autoResolved ? "[status: outdated, auto-resolved]" : `[status: ${t.firstLookStatus}]`;
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
  const line = `- \`threadId=${t.id}\`${link} ${loc} (@${t.author})${suggestionMarker}${statusSuffix}: ${renderBodyPreview(t.body)}`;
  if (t.suggestion && opts.renderSuggestion) {
    return `${line}\n${renderSuggestionBlock(t.suggestion)}`;
  }
  return line;
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
