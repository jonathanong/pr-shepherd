import type { MinimizeCommentsPolicy } from "../config/load.mts";
import type { AuthorType } from "../types.mts";
import { isConfiguredBotAuthor, isHumanAuthor, type NormalizedBotUsernames } from "./authors.mts";

export function shouldMinimizeAuthor(
  authorType: AuthorType | undefined,
  policy: MinimizeCommentsPolicy | undefined,
  author?: string,
  botUsernames: NormalizedBotUsernames = new Set(),
): boolean {
  const isConfiguredBot = isConfiguredBotAuthor({ author, authorType }, botUsernames);
  if (isHumanAuthor({ author, authorType }) && !isConfiguredBot) return false;
  switch (policy) {
    case undefined:
    case "all":
      return authorType !== "User" || isConfiguredBot;
    case "bots":
      return isConfiguredBot;
    case "users":
      return false;
    case "none":
      return false;
    default:
      throw new Error(`Invalid minimizeComments policy: ${String(policy)}`);
  }
}
