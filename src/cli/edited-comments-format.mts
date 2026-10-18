import { blockquote, renderAuthor } from "./list-formatters.mts";
import { BODY_TRUNCATE_MAX_CHARS } from "./body-truncate.mts";
import { toAgentComment } from "../reporters/agent.mts";
import type { EditedComment } from "../types.mts";

const HEADING = "Edited comments";

function editedTag(c: EditedComment): string {
  return c.isMinimized ? "[status: minimized, edited]" : "[edited since first look]";
}

/** Markdown for `editedComments`; null when there are none. Edits are informational only. */
function formatEditedCommentsSection(
  comments: readonly EditedComment[] | undefined,
  verbose: boolean,
): string | null {
  if (!comments?.length) return null;
  const cap = verbose ? undefined : BODY_TRUNCATE_MAX_CHARS;
  const parts = [
    `## ${HEADING} (${comments.length}) — informational; edits do not block readiness`,
  ];
  for (const c of comments) {
    const heading = c.url ? `[commentId=${c.id}](${c.url})` : `\`commentId=${c.id}\``;
    parts.push(
      `### ${heading} (${renderAuthor(c.author, c.authorType, c.authorAssociation)}) ${editedTag(c)}`,
    );
    parts.push(blockquote(c.body, cap, c.url));
  }
  return parts.join("\n\n");
}

/** Insert the edited-comments section before `## Instructions` (or append it). */
export function insertEditedCommentsSection(
  text: string,
  comments: readonly EditedComment[] | undefined,
  verbose: boolean,
): string {
  const section = formatEditedCommentsSection(comments, verbose);
  if (!section) return text;
  const index = text.lastIndexOf("## Instructions");
  if (index === -1) return `${text}\n\n${section}`;
  return `${text.slice(0, index)}${section}\n\n${text.slice(index)}`;
}

/** JSON projection matching the text section: the agent comment plus its minimized status. */
export function projectEditedComments(comments: readonly EditedComment[]) {
  return comments.map((c) => ({
    ...toAgentComment(c),
    ...(c.isMinimized && { isMinimized: true }),
  }));
}
