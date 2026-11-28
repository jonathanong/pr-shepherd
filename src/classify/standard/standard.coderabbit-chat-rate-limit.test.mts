import { describe, expect, it } from "vitest";
import { fixture, matches, variant } from "../../../test-helpers/standard-rule-variants.mts";

describe("CodeRabbit chat rate-limit notice", () => {
  const chatLimit = fixture("coderabbit-chat-rate-limit-reply");
  const wait = (to: string) => variant(chatLimit.body, "18 minutes and 14 seconds", to);

  it("accepts duration, phrasing, punctuation, marker, and optional-paragraph variants", () => {
    for (const to of [
      "1 second",
      "45 seconds",
      "1 minute",
      "5 minutes",
      "1 minute and 1 second",
      "1 hour",
      "1 hour and 5 minutes",
      "1 hour and 30 seconds",
      "1 hour, 2 minutes and 3 seconds",
      "1 hour, 2 minutes, and 3 seconds",
    ]) {
      expect(matches(chatLimit, wait(to))).toEqual(["coderabbit-notices"]);
    }
    expect(
      matches(chatLimit, variant(chatLimit.body, "`@jonathanong` have", "`@jonathanong` has")),
    ).toEqual(["coderabbit-notices"]);
    expect(
      matches(chatLimit, variant(chatLimit.body, "`@jonathanong` have", "@my-bot[bot] has")),
    ).toEqual(["coderabbit-notices"]);
    expect(matches(chatLimit, variant(chatLimit.body, "`@jonathanong` have", "You have"))).toEqual([
      "coderabbit-notices",
    ]);
    expect(
      matches(
        chatLimit,
        variant(variant(chatLimit.body, "per hour", "per minute"), "an hour", "a minute").replace(
          "each hour",
          "each minute",
        ),
      ),
    ).toEqual(["coderabbit-notices"]);
    expect(
      matches(chatLimit, variant(chatLimit.body, "50 chat messages", "1,000 chat messages")),
    ).toEqual(["coderabbit-notices"]);
    expect(
      matches(chatLimit, chatLimit.body.replace("didn't", "didn’t").replace("won't", "won’t")),
    ).toEqual(["coderabbit-notices"]);
    expect(matches(chatLimit, chatLimit.body.replaceAll("\n", "\r\n"))).toEqual([
      "coderabbit-notices",
    ]);
    expect(matches(chatLimit, `<!-- coderabbit-ai-generated:v1 -->\n\n${chatLimit.body}`)).toEqual([
      "coderabbit-notices",
    ]);
    const firstTwo = chatLimit.body.split("\n\n").slice(0, 2).join("\n\n");
    const firstThree = chatLimit.body.split("\n\n").slice(0, 3).join("\n\n");
    expect(matches(chatLimit, firstTwo)).toEqual(["coderabbit-notices"]);
    expect(matches(chatLimit, firstThree)).toEqual(["coderabbit-notices"]);
  });

  it("keeps malformed notices, off-host links, appended findings, and thread roots visible", () => {
    expect(matches(chatLimit, wait("soon"))).toEqual([]);
    expect(matches(chatLimit, wait("1 hour, 2 minutes and 3 minutes"))).toEqual([]);
    expect(
      matches(chatLimit, variant(chatLimit.body, "50 chat messages", "250,00 chat messages")),
    ).toEqual([]);
    expect(
      matches(chatLimit, variant(chatLimit.body, "2026-11-28 04:55:42 UTC", "tomorrow")),
    ).toEqual([]);
    expect(
      matches(
        chatLimit,
        variant(chatLimit.body, "https://docs.coderabbit.ai/", "https://example.com/"),
      ),
    ).toEqual([]);
    expect(
      matches(chatLimit, `${chatLimit.body}\n\nI found a bug in the authorization check.`),
    ).toEqual([]);
    expect(matches(chatLimit, chatLimit.body, "review-thread")).toEqual([]);
  });
});
