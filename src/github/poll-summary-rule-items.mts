import { applyRules } from "../classify/apply.mts";
import type { ClassifyAction, ClassifyItem } from "../classify/types.mts";
import { normalizeAuthorType } from "../comments/authors.mts";
import type { RawAuthor } from "./poll-summary-raw.mts";

type Rules = Parameters<typeof applyRules>[0];

export interface RuleSource {
  id: string;
  body: string;
  author: RawAuthor | null;
  authorAssociation?: string;
  url?: string;
  path?: string | null;
}

/** The rule action for one compact item, built like the full check builds its rule items. */
export function summaryRuleAction(
  rules: Rules,
  kind: ClassifyItem["kind"],
  raw: RuleSource | undefined,
  id = raw?.id ?? "unknown",
  path?: string | null,
  body = raw?.body ?? "",
): ClassifyAction {
  const item = {
    kind,
    id,
    author: raw?.author?.login ?? "unknown",
    authorType: normalizeAuthorType(raw?.author?.__typename, raw?.author?.login),
    ...(raw?.authorAssociation !== undefined && { authorAssociation: raw.authorAssociation }),
    body,
    // A changes-requested rule item carries no URL, as in the full check.
    ...(kind === "review-thread" ? { url: raw?.url ?? "" } : {}),
    ...(kind !== "review-thread" && kind !== "changes-requested" && raw?.url
      ? { url: raw.url }
      : {}),
    ...(kind === "review-thread" && { path }),
  } as ClassifyItem;
  return applyRules(rules, item);
}

/**
 * An auto-resolve match is hidden only once its mutation is confirmed or the item is already
 * resolved; until then it stays visible so the full check can run or surface it.
 */
export function ruleHides(
  action: ClassifyAction,
  kind: ClassifyItem["kind"],
  autoResolveSatisfied: boolean,
): boolean {
  return (
    action.suppress === true &&
    (action.autoResolve !== true || kind === "changes-requested" || autoResolveSatisfied)
  );
}
