import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ClassifyItem, ClassifyItemKind } from "../types.mts";
import { STANDARD_RULES, STANDARD_RULE_NAMES } from "./index.mts";

interface Fixture {
  readonly name: string;
  readonly kind: ClassifyItemKind;
  readonly author: string;
  readonly body: string;
}
interface NoticeFixture extends Fixture {
  readonly rule: string;
  readonly expect: { readonly suppress: boolean; readonly autoResolve?: boolean };
}

const readFixtures = <T,>(file: string): T[] =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${file}`, import.meta.url), "utf8")) as T[];
const notices = readFixtures<NoticeFixture>("notices.json");
const mixed = readFixtures<Fixture>("mixed.json");

const item = (f: Fixture, overrides: Partial<ClassifyItem> = {}): ClassifyItem =>
  ({
    kind: f.kind,
    id: `id-${f.name}`,
    author: f.author,
    authorType: "Bot",
    body: f.body,
    ...overrides,
  }) as ClassifyItem;

/** Rules whose whole comment is a generated report, so trailing headings are part of it. */
const WHOLE_REPORT_RULES = new Set(["codecov-report"]);

const matches = (i: ClassifyItem) =>
  STANDARD_RULE_NAMES.filter((name) => STANDARD_RULES[name]!(i) != null);

describe("standard classification rules", () => {
  it("names every rule in kebab-case and covers each with a notice fixture", () => {
    for (const name of STANDARD_RULE_NAMES) {
      expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(notices.some((n) => n.rule === name)).toBe(true);
    }
  });

  describe.each(notices)("notice $name", (f) => {
    it(`matches only ${f.rule} with the expected action`, () => {
      expect(matches(item(f))).toEqual([f.rule]);
      const action = STANDARD_RULES[f.rule]!(item(f));
      expect(action?.suppress).toBe(f.expect.suppress);
      expect(action?.autoResolve).toBe(f.expect.autoResolve);
      expect(action?.reason).toBeTruthy();
    });

    it("matches REST [bot] and uppercase logins", () => {
      expect(matches(item(f, { author: `${f.author}[bot]` }))).toEqual([f.rule]);
      expect(matches(item(f, { author: f.author.toUpperCase() }))).toEqual([f.rule]);
    });

    it("ignores other authors, human accounts, and other kinds", () => {
      expect(matches(item(f, { author: "octocat" }))).toEqual([]);
      expect(matches(item(f, { authorType: "User" }))).toEqual([]);
      expect(matches(item(f, { authorType: "Unknown" }))).toEqual([]);
      expect(matches(item(f, { kind: "review-summary" }))).toEqual([]);
      expect(matches(item(f, { kind: "review-thread" }))).toEqual([]);
      expect(matches(item(f, { kind: "changes-requested" }))).toEqual([]);
    });

    it.skipIf(WHOLE_REPORT_RULES.has(f.rule))(
      "keeps the notice visible when real feedback is appended",
      () => {
        const body = `${f.body}\n\n## Potential bug\n\nThis line dereferences \`user\` before the null check.`;
        expect(matches(item(f, { body }))).toEqual([]);
      },
    );
  });

  it.each(mixed)("keeps $name visible", (f) => {
    expect(matches(item(f))).toEqual([]);
  });

  it.each(["gemini-notices", "sourcery-notices", "kilo-no-issues"])(
    "keeps appended plain-prose findings visible for %s",
    (ruleName) => {
      for (const fixture of notices.filter((notice) => notice.rule === ruleName)) {
        const body = `${fixture.body}\n\nI found a bug in the authorization check.`;
        expect(matches(item(fixture, { body }))).toEqual([]);
      }
    },
  );

  it("keeps a Kilo report with an inconsistent file count visible", () => {
    const fixture = notices.find((notice) => notice.name === "kilo-no-issues")!;
    expect(matches(item(fixture, { body: fixture.body.replace("2 files", "3 files") }))).toEqual(
      [],
    );
  });

  it("does not match marker-only bodies", () => {
    for (const body of [
      "<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->",
      "### 💡 Codex Review",
      "",
    ]) {
      for (const f of notices) expect(matches(item(f, { body }))).toEqual([]);
    }
  });
});
