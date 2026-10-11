import type { ClassifyItem, ClassifyItemKind } from "../types.mts";

/** Lowercased login without the REST `[bot]` suffix, so GraphQL and REST logins compare equal. */
function normalizeLogin(login: string): string {
  return login.toLowerCase().replace(/\[bot\]$/, "");
}

/** True when GitHub reports a bot author whose normalized login is one of `logins`. */
export function isBotItem(
  item: ClassifyItem,
  logins: readonly string[],
  kinds: readonly ClassifyItemKind[],
): boolean {
  return (
    item.authorType === "Bot" &&
    kinds.includes(item.kind) &&
    logins.includes(normalizeLogin(item.author))
  );
}
