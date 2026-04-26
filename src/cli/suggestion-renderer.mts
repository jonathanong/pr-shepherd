import { safeFence } from "./fence.mts";
import type { SuggestionBlock } from "../types.mts";

export function renderLineRange(startLine: number | undefined, endLine: number | null): string {
  if (endLine === null) return "?";
  if (startLine !== undefined && startLine !== endLine) return `${startLine}-${endLine}`;
  return String(endLine);
}

export function renderSuggestionBlock(s: SuggestionBlock, indent = "  "): string {
  const rangeLabel =
    s.startLine !== s.endLine
      ? `lines ${s.startLine}–${s.endLine}`
      : `line ${s.startLine}`;

  const content = s.lines.join("\n");
  const fence = safeFence(content);
  const label =
    s.lines.length === 0
      ? `Replaces ${rangeLabel} with nothing:`
      : s.lines.length === 1 && s.lines[0] === ""
        ? `Replaces ${rangeLabel} with a blank line:`
        : `Replaces ${rangeLabel}:`;

  return [
    `${indent}${label}`,
    `${indent}${fence}`,
    ...(content === ""
      ? []
      : [
          content
            .split("\n")
            .map((l) => `${indent}${l}`)
            .join("\n"),
        ]),
    `${indent}${fence}`,
  ].join("\n");
}
