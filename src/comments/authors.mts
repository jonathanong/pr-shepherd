import type { AuthorType } from "../types.mts";

function isBotLogin(login: string | undefined | null): boolean {
  return (login ?? "").toLowerCase().includes("[bot]");
}

export type NormalizedBotUsernames = ReadonlySet<string>;

function normalizeBotUsername(login: string | undefined | null): string {
  return (login ?? "")
    .trim()
    .toLowerCase()
    .replace(/\[bot\]$/i, "");
}

export function normalizeBotUsernames(
  botUsernames: readonly string[] | undefined | null = [],
): NormalizedBotUsernames {
  return new Set((botUsernames ?? []).map((name) => normalizeBotUsername(name)));
}

export function normalizeAuthorType(
  typeName: string | undefined | null,
  login: string | undefined | null,
): AuthorType {
  if (isBotLogin(login)) return "Bot";
  if (typeName === "User" || typeName === "Bot") return typeName;
  return "Unknown";
}

export function isHumanAuthor(author: {
  author?: string;
  login?: string;
  authorType?: AuthorType;
}): boolean {
  const login = author.author ?? author.login ?? "";
  return author.authorType === "User" && !isBotLogin(login);
}

export function isConfiguredBotAuthor(
  author: {
    author?: string;
    login?: string;
    authorType?: AuthorType;
  },
  botUsernames: NormalizedBotUsernames = new Set(),
): boolean {
  const login = author.author ?? author.login ?? "";
  if (author.authorType === "Bot" || isBotLogin(login)) return true;
  const normalized = normalizeBotUsername(login);
  if (normalized === "") return false;
  return botUsernames.has(normalized);
}
