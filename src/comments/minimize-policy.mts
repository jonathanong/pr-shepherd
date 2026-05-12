import type { MinimizeCommentsPolicy } from "../config/load.mts";
import type { AuthorType } from "../types.mts";

export function shouldMinimizeAuthor(
  authorType: AuthorType | undefined,
  policy: MinimizeCommentsPolicy | undefined,
): boolean {
  switch (policy) {
    case undefined:
    case "all":
      return true;
    case "bots":
      return authorType === "Bot";
    case "users":
      return authorType === "User";
    case "none":
      return false;
  }
}
