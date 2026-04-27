import type { FirstLookThread, FirstLookComment } from "../types/report.mts";

export function firstLine(text: string): string {
  const newlineIndex = text.indexOf("\n");
  const line = newlineIndex === -1 ? text : text.slice(0, newlineIndex);
  return line.trim().slice(0, 120);
}

export function renderFirstLookItems(
  threads: FirstLookThread[],
  comments: FirstLookComment[],
): string | null {
  const total = threads.length + comments.length;
  if (total === 0) return null;
  const lines: string[] = [
    `## First-look items (${total}) — already closed on GitHub; acknowledge only`,
    "",
  ];
  for (const t of threads) {
    const statusTag = t.autoResolved
      ? `[status: outdated, auto-resolved]`
      : `[status: ${t.firstLookStatus}]`;
    const loc = t.path ? `\`${t.path}:${t.line ?? "?"}\`` : "(no location)";
    lines.push(`- \`threadId=${t.id}\` ${loc} (@${t.author}) ${statusTag}`);
    lines.push(`  ${firstLine(t.body)}`);
  }
  for (const c of comments) {
    lines.push(`- \`commentId=${c.id}\` (@${c.author}) [status: minimized]`);
    lines.push(`  ${firstLine(c.body)}`);
  }
  return lines.join("\n");
}
