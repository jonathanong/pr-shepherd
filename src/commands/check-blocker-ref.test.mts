import { describe, expect, it } from "vitest";
import { parseBlockedByRef } from "./check-blocker-ref.mts";

const pull = { owner: "acme", name: "widgets", number: 9, kind: "pull" as const };
const issue = { owner: "acme", name: "widgets", number: 9, kind: "issue" as const };

describe("parseBlockedByRef", () => {
  it.each([
    ["https://github.com/acme/widgets/pull/9", pull],
    ["http://www.github.com/acme/widgets/pull/9/", pull],
    ["acme/widgets#9", pull],
    ["https://github.com/acme/widgets/issues/9", issue],
    ["issue:acme/widgets#9", issue],
  ])("accepts %s", (raw, expected) => {
    expect(parseBlockedByRef(raw)).toEqual(expected);
  });

  it.each([
    "nope",
    "ftp://github.com/acme/widgets/pull/9",
    "https://example.com/acme/widgets/pull/9",
    "https://github.com/acme/widgets/pull/9?x=1",
    "https://github.com/acme/widgets/pull/9#diff",
    "https://github.com/acme/widgets/pull/9/files",
    "https://github.com/acme$/widgets/pull/9",
    "https://github.com/acme/widgets/pulls/9",
    "https://github.com/acme/widgets/pull/0",
    "https://github.com/acme/widgets/pull/9007199254740993",
    "acme/widgets#9007199254740993",
    "issues:acme/widgets#9",
    "issue:https://github.com/acme/widgets/issues/9",
  ])("rejects %s", (raw) => {
    expect(parseBlockedByRef(raw)).toBeNull();
  });
});
