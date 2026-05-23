import type { MinimizeCommentsPolicy } from "../config/load.mts";
import type { AuthorType } from "../types.mts";
import { isHumanAuthor } from "./authors.mts";

export function shouldMinimizeAuthor(
  authorType: AuthorType | undefined,
  policy: MinimizeCommentsPolicy | undefined,
  author?: string,
): boolean {
  if (isHumanAuthor({ author, authorType })) return false;
  switch (policy) {
    case undefined:
    case "all":
      return authorType !== "User";
    case "bots":
      return authorType === "Bot";
    case "users":
      return false;
    case "none":
      return false;
    default:
      throw new Error(`Invalid minimizeComments policy: ${String(policy)}`);
  }
}
