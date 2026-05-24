import type { MinimizeCommentsPolicy } from "../config/load.mts";
import type { AuthorType } from "../types.mts";
import { isConfiguredBotAuthor, isHumanAuthor } from "./authors.mts";

export function shouldMinimizeAuthor(
  authorType: AuthorType | undefined,
  policy: MinimizeCommentsPolicy | undefined,
  author?: string,
  botUsernames: readonly string[] = [],
): boolean {
  if (
    isHumanAuthor({ author, authorType }) &&
    !isConfiguredBotAuthor({ author, authorType }, botUsernames)
  )
    return false;
  switch (policy) {
    case undefined:
    case "all":
      return authorType !== "User" || isConfiguredBotAuthor({ author, authorType }, botUsernames);
    case "bots":
      return isConfiguredBotAuthor({ author, authorType }, botUsernames);
    case "users":
      return false;
    case "none":
      return false;
    default:
      throw new Error(`Invalid minimizeComments policy: ${String(policy)}`);
  }
}
