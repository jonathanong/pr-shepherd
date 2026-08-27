import type { SuggestionPatchRequest } from "../commands/suggestion-patch-item.mts";

type ParseFailure = { ok: false; error: string };
type ParseResult = { ok: true; suggestions: SuggestionPatchRequest[] } | ParseFailure;

interface ParsedFlag {
  name: "--thread-id" | "--message" | "--description";
  value: string;
  consumed: number;
}

export function parseSuggestionPatchGroups(args: readonly string[]): ParseResult {
  const parsed = parseFlags(args);
  if (!parsed.ok) return parsed;
  return groupFlags(parsed.flags);
}

function parseFlags(args: readonly string[]): { ok: true; flags: ParsedFlag[] } | ParseFailure {
  const flags: ParsedFlag[] = [];
  for (let index = 0; index < args.length;) {
    const parsed = parseFlag(args, index);
    if (!parsed) return { ok: false, error: `Unknown argument: ${args[index]}` };
    flags.push(parsed);
    index += parsed.consumed;
  }
  return { ok: true, flags };
}

function groupFlags(flags: readonly ParsedFlag[]): ParseResult {
  const suggestions: SuggestionPatchRequest[] = [];
  let current: Partial<SuggestionPatchRequest> | null = null;
  for (const flag of flags) {
    if (flag.name === "--thread-id") {
      const finalized = finalize(current);
      if (!finalized.ok) return finalized;
      if (finalized.suggestion) suggestions.push(finalized.suggestion);
      current = { threadId: flag.value };
      continue;
    }
    const updated = setMetadata(current, flag);
    if (!updated.ok) return updated;
    current = updated.current;
  }
  const finalized = finalize(current);
  if (!finalized.ok) return finalized;
  if (finalized.suggestion) suggestions.push(finalized.suggestion);
  if (suggestions.length === 0)
    return { ok: false, error: "At least one --thread-id is required." };
  return { ok: true, suggestions };
}

function setMetadata(
  current: Partial<SuggestionPatchRequest> | null,
  flag: ParsedFlag,
): { ok: true; current: Partial<SuggestionPatchRequest> } | { ok: false; error: string } {
  if (!current) return { ok: false, error: `${flag.name} must follow --thread-id.` };
  const property = flag.name === "--message" ? "message" : "description";
  if (current[property] !== undefined) {
    return { ok: false, error: `${flag.name} may appear only once per suggestion.` };
  }
  return { ok: true, current: { ...current, [property]: flag.value } };
}

function parseFlag(
  args: readonly string[],
  index: number,
): {
  name: "--thread-id" | "--message" | "--description";
  value: string;
  consumed: number;
} | null {
  const arg = args[index]!;
  for (const name of ["--thread-id", "--message", "--description"] as const) {
    if (arg.startsWith(`${name}=`)) {
      return { name, value: arg.slice(name.length + 1), consumed: 1 };
    }
    if (arg === name && index + 1 < args.length) {
      return { name, value: args[index + 1]!, consumed: 2 };
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
