import type { AuthorType } from "../types.mts";

export function isBotLogin(login: string | undefined | null): boolean {
  return (login ?? "").toLowerCase().includes("[bot]");
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
