import { parseSuggestion } from "./parse.mts";
import type { SuggestionBlock } from "../types.mts";

export function extractSuggestion(thread: {
  path: string | null;
  line: number | null;
  startLine: number | null;
  body: string;
  author: string;
}): SuggestionBlock | null {
  if (!thread.path || thread.line === null) return null;
  const parsed = parseSuggestion(thread.body);
  if (!parsed) return null;
  const startLine = thread.startLine ?? thread.line;
  return {
    startLine,
    endLine: thread.line,
    lines: parsed.lines,
    author: thread.author,
  };
}
