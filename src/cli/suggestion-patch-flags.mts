import type { SuggestionPatchRequest } from "../commands/suggestion-patch-item.mts";

type ParseResult =
  | { ok: true; suggestions: SuggestionPatchRequest[] }
  | { ok: false; error: string };

export function parseSuggestionPatchGroups(args: readonly string[]): ParseResult {
  const suggestions: SuggestionPatchRequest[] = [];
  let current: Partial<SuggestionPatchRequest> | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const parsed = parseFlag(args, index);
    if (!parsed) return { ok: false, error: `Unknown argument: ${args[index]}` };
    index = parsed.nextIndex;
    if (parsed.name === "--thread-id") {
      const finalized = finalize(current);
      if (!finalized.ok) return finalized;
      if (finalized.suggestion) suggestions.push(finalized.suggestion);
      current = { threadId: parsed.value };
      continue;
    }
    if (!current) {
      return { ok: false, error: `${parsed.name} must follow --thread-id.` };
    }
    const property = parsed.name === "--message" ? "message" : "description";
    if (current[property] !== undefined) {
      return { ok: false, error: `${parsed.name} may appear only once per suggestion.` };
    }
    current[property] = parsed.value;
  }
  const finalized = finalize(current);
  if (!finalized.ok) return finalized;
  if (finalized.suggestion) suggestions.push(finalized.suggestion);
  if (suggestions.length === 0)
    return { ok: false, error: "At least one --thread-id is required." };
  return { ok: true, suggestions };
}

function parseFlag(
  args: readonly string[],
  index: number,
): {
  name: "--thread-id" | "--message" | "--description";
  value: string;
  nextIndex: number;
} | null {
  const arg = args[index]!;
  for (const name of ["--thread-id", "--message", "--description"] as const) {
    if (arg.startsWith(`${name}=`)) {
      return { name, value: arg.slice(name.length + 1), nextIndex: index };
    }
    if (arg === name && index + 1 < args.length) {
      return { name, value: args[index + 1]!, nextIndex: index + 1 };
    }
  }
  return null;
}

function finalize(
  current: Partial<SuggestionPatchRequest> | null,
): { ok: true; suggestion: SuggestionPatchRequest | null } | { ok: false; error: string } {
  if (!current) return { ok: true, suggestion: null };
  if (!current.threadId || current.threadId.trim() === "") {
    return { ok: false, error: "--thread-id must be non-empty." };
  }
  if (!current.message || current.message.trim() === "") {
    return { ok: false, error: `--message is required for thread ${current.threadId}.` };
  }
  return {
    ok: true,
    suggestion: {
      threadId: current.threadId,
      message: current.message,
      ...(current.description !== undefined && { description: current.description }),
    },
  };
}
