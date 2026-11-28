import { readFileSync } from "node:fs";
import { expect } from "vitest";
import type { ClassifyItem, ClassifyItemKind } from "../src/classify/types.mts";
import { STANDARD_RULES, STANDARD_RULE_NAMES } from "../src/classify/standard/index.mts";

interface Fixture {
  readonly name: string;
  readonly kind?: ClassifyItemKind;
  readonly author: string;
  readonly body: string;
}

const notices = JSON.parse(
  readFileSync(
    new URL("../src/classify/standard/__fixtures__/notices.json", import.meta.url),
    "utf8",
  ),
) as Fixture[];

/** The notice fixture with this name. */
export const fixture = (name: string): Fixture => notices.find((notice) => notice.name === name)!;

/** Standard rules matching `body` as a bot item from the fixture's author and kind. */
export const matches = (
  f: Fixture,
  body: string,
  kind: ClassifyItemKind = f.kind ?? "pr-comment",
) => {
  const item = {
    kind,
    id: "id",
    ...(kind === "review-thread-reply" && { threadId: "thread-id" }),
    author: f.author,
    authorType: "Bot",
    body,
  };
  return STANDARD_RULE_NAMES.filter((name) => STANDARD_RULES[name]!(item as ClassifyItem) != null);
};

/** Replaces exactly one occurrence so a variant cannot silently leave the fixture unchanged. */
export function variant(body: string, from: string | RegExp, to: string): string {
  const next = body.replace(from, to);
  expect(next).not.toBe(body);
  return next;
}
