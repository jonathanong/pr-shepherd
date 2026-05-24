import type { AuthorType } from "../types.mts";

export function isBotLogin(login: string | undefined | null): boolean {
  return (login ?? "").toLowerCase().includes("[bot]");
}

function normalizeBotUsername(login: string | undefined | null): string {
  return (login ?? "")
    .trim()
    .toLowerCase()
    .replace(/\[bot\]$/i, "");
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
  botUsernames: readonly string[] = [],
): boolean {
  const login = author.author ?? author.login ?? "";
  if (author.authorType === "Bot" || isBotLogin(login)) return true;
  const normalized = normalizeBotUsername(login);
  if (normalized === "") return false;
  const configured = new Set(botUsernames.map((name) => normalizeBotUsername(name)));
  return configured.has(normalized);
}
