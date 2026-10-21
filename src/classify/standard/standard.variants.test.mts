import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ClassifyItem } from "../types.mts";
import { STANDARD_RULES, STANDARD_RULE_NAMES } from "./index.mts";

interface Fixture {
  readonly name: string;
  readonly author: string;
  readonly body: string;
}

const notices = JSON.parse(
  readFileSync(new URL("./__fixtures__/notices.json", import.meta.url), "utf8"),
) as Fixture[];
const fixture = (name: string): Fixture => notices.find((notice) => notice.name === name)!;

const matches = (f: Fixture, body: string) => {
  const item = { kind: "pr-comment", id: "id", author: f.author, authorType: "Bot", body };
  return STANDARD_RULE_NAMES.filter((name) => STANDARD_RULES[name]!(item as ClassifyItem) != null);
};

/** Replaces exactly one occurrence so a variant cannot silently leave the fixture unchanged. */
function variant(body: string, from: string | RegExp, to: string): string {
  const next = body.replace(from, to);
  expect(next).not.toBe(body);
  return next;
}

describe("CodeRabbit chrome variants", () => {
  const progress = fixture("coderabbit-progress-with-finishing-touch");
  const reply = fixture("coderabbit-rate-limit-reply");

  it("accepts new finishing-touch checkbox ids and option groups", () => {
    const newIds = variant(progress.body, /"checkboxId":"3e1879ae-[^"]+"/, '"checkboxId":"new-id"');
    const extraGroup = variant(
      progress.body,
      "\n\n</dd>\n</dl>\n</details>\n\n<!-- finishing_touch_checkbox_end -->",
      '\n<details open>\n<summary><strong>🔧 Generate fixes</strong></summary>\n<dl>\n<dd>\n\n- [ ] <!-- {"checkboxId":"x"} --> Commit to this branch\n\n</dd>\n</dl>\n</details>\n\n</dd>\n</dl>\n</details>\n\n<!-- finishing_touch_checkbox_end -->',
    );
    expect(matches(progress, newIds)).toEqual(["coderabbit-notices"]);
    expect(matches(progress, extraGroup)).toEqual(["coderabbit-notices"]);
  });

  it("keeps prose or links inside the finishing-touch block visible", () => {
    const prose = variant(
      progress.body,
      "--> Create a new PR\n",
      "--> Create a new PR\nThis line dereferences user before the null check.\n",
    );
    const link = variant(progress.body, "--> Create a new PR\n", '--> <a href="x">PR</a>\n');
    expect(matches(progress, prose)).toEqual([]);
    expect(matches(progress, link)).toEqual([]);
  });

  it("accepts a new Autofix checkbox id and description", () => {
    const body = variant(
      progress.body,
      /\{"checkboxId":"2708ad07-[^"]+"\} --> <strong title="[^"]+">Autofix<\/strong> · [^\n]+/,
      '{"checkboxId":"new-id"} --> <strong title="Fix findings">Autofix</strong> · Fix findings',
    );
    expect(matches(progress, body)).toEqual(["coderabbit-notices"]);
  });

  it("accepts new command invocation ids, notes, and the generated marker", () => {
    const newId = variant(reply.body, /invocation: v2:[a-f0-9]+/, "invocation: v3:abc-123");
    const newNote = variant(reply.body, /> Note: [^\n]+/, "> Note: Automatic reviews are paused.");
    const marked = `<!-- coderabbit-ai-generated:v2 -->\n\n${reply.body}`;
    for (const body of [newId, newNote, marked]) {
      expect(matches(reply, body)).toEqual(["coderabbit-notices"]);
    }
  });

  it("keeps a command reply with an extra paragraph visible", () => {
    const body = variant(reply.body, "\n\n</details>", "\n\nThis line has a bug.\n\n</details>");
    expect(matches(reply, body)).toEqual([]);
  });
});

describe("Codex variants", () => {
  const activity = fixture("codex-activity-with-state");
  const clean = fixture("codex-clean-bravo");

  it("accepts any codex-* metadata markers in any order", () => {
    const lines = activity.body.split("\n");
    const reordered = [lines[0], lines[2], lines[1], ...lines.slice(3)].join("\n");
    const bumped = activity.body.replaceAll(":v1 {", ":v2 {");
    const extra = variant(
      activity.body,
      "<!-- codex-pull-request-review-summary -->\n",
      '<!-- codex-pull-request-review-summary -->\n<!-- codex-merge-gate:v1 {"x":1} -->\n',
    );
    for (const body of [reordered, bumped, extra]) {
      expect(matches(activity, body)).toEqual(["codex-notices"]);
    }
  });

  it("keeps a non-Codex marker before the table visible", () => {
    const body = variant(
      activity.body,
      "<!-- codex-pull-request-review-summary -->\n",
      "<!-- codex-pull-request-review-summary -->\n<!-- other -->\nA finding.\n",
    );
    expect(matches(activity, body)).toEqual([]);
  });

  it.each([
    "Chef's kiss.",
    "Keep it up!",
    "What shall we delve into next?",
    ":rocket:",
    "🎉",
    "🛡️",
  ])("accepts the sign-off %s", (signOff) => {
    expect(matches(clean, variant(clean.body, "Bravo.", signOff))).toEqual(["codex-notices"]);
  });

  it.each([
    "`user` is dereferenced before the null check.",
    "See [this](https://example.com) bug.",
    "But the authorization check is broken here.",
    "Bravo. Also auth.ts line 4 is wrong.",
  ])("keeps the sign-off %s visible", (signOff) => {
    expect(matches(clean, variant(clean.body, "Bravo.", signOff))).toEqual([]);
  });

  it("accepts moved Codex settings and report links", () => {
    const quota = fixture("codex-code");
    const security = fixture("codex-clean-security");
    const movedQuota = quota.body.replaceAll("chatgpt.com/codex/cloud/", "chatgpt.com/codex/");
    const movedReport = variant(security.body, /tasks\/task_e_[a-f0-9]+/, "reports/r-1?ref=gh");
    expect(matches(quota, movedQuota)).toEqual(["codex-notices"]);
    expect(matches(security, movedReport)).toEqual(["codex-notices"]);
    expect(matches(quota, quota.body.replaceAll("chatgpt.com", "example.com"))).toEqual([]);
  });
});

describe("Sourcery variants", () => {
  const upsell = fixture("sourcery-no-access");

  it("accepts a changed upgrade link on the Sourcery domain only", () => {
    const moved = variant(
      upsell.body,
      /\(https:\/\/app\.sourcery\.ai\/[^)]+\)/,
      "(https://app.sourcery.ai/upgrade?ref=bot)",
    );
    const offsite = variant(upsell.body, "https://app.sourcery.ai/", "https://example.com/");
    expect(matches(upsell, moved)).toEqual(["sourcery-notices"]);
    expect(matches(upsell, offsite)).toEqual([]);
  });
});
