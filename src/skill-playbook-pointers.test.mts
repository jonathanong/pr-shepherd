import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../", import.meta.url);

/**
 * `## Instructions` steps point at invariant procedures with a
 * `See "<name>" in the pr-shepherd skill` sentence instead of inlining them (see CLAUDE.md
 * "Keep skills and loop prompts minimal" — the invariant-procedure exception). Nothing else
 * cross-checks a pointer's `<name>` against the skill's actual `## Playbooks` headings: a
 * typo'd or renamed heading is a silently dead pointer, and the failure mode is the agent
 * skipping the exception handling entirely — which is exactly the guidance that was moved
 * out of `## Instructions` to make room for it. This test is the load-bearing check.
 */
function skillPlaybookHeadings(): Set<string> {
  const skill = readFileSync(
    new URL("plugins/pr-shepherd/skills/pr-shepherd/SKILL.md", rootUrl),
    "utf8",
  );
  const headings = new Set<string>();
  for (const match of skill.matchAll(/^### (.+)$/gm)) {
    headings.add(match[1]!.trim());
  }
  return headings;
}

function pointedPlaybookNames(text: string): string[] {
  return [...text.matchAll(/"([^"]+)" in the pr-shepherd skill/g)].map((m) => m[1]!);
}

describe("CLI instruction pointers name real pr-shepherd skill playbooks", () => {
  const headings = skillPlaybookHeadings();

  it("SKILL.md declares at least one ### playbook heading", () => {
    expect(headings.size).toBeGreaterThan(0);
  });

  it("every pointer in the committed snapshot corpus names an existing playbook heading", () => {
    // The snapshot corpus (test-cases/snapshots/*/output.text.md) is generated straight from
    // buildFixInstructions and covers every gated instruction branch across its ~65 fixtures
    // — suggestions, CI triage, the resolve command, resolution-only routing, and the
    // journal step all appear somewhere in it. Sweeping the corpus is a comprehensive,
    // low-maintenance stand-in for hand-driving every instruction builder with contrived
    // inputs, and it exercises the exact strings a real invocation would print.
    //
    // Caveat: this reads the *committed* snapshots, not the builders directly. A source
    // change that renames a pointer's playbook name passes this test until `vitest -u`
    // regenerates the snapshots — but the corpus-equality test in test-cases/index.test.mts
    // fails on that same stale snapshot in the same run, so the gap is covered in practice.
    const snapshotsDir = new URL("test-cases/snapshots/", rootUrl);
    const dirs = readdirSync(snapshotsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(dirs.length).toBeGreaterThan(0);

    const foundNames = new Set<string>();
    for (const dir of dirs) {
      const path = new URL(`${dir.name}/output.text.md`, snapshotsDir);
      const text = readFileSync(path, "utf8");
      for (const name of pointedPlaybookNames(text)) {
        foundNames.add(name);
        expect(
          headings.has(name),
          `"${name}" (from ${dir.name}) has no matching ### heading in SKILL.md`,
        ).toBe(true);
      }
    }

    // Guard against every pointer silently disappearing (e.g. a future refactor that drops
    // the pointer sentences entirely) — this test would otherwise pass vacuously.
    expect(foundNames.size).toBeGreaterThan(0);
    // Every declared playbook should be reachable from at least one CLI instruction, or it
    // is dead reference material the agent can never be pointed to.
    for (const heading of headings) {
      expect(
        foundNames.has(heading),
        `SKILL.md playbook "${heading}" is never pointed to from any snapshot`,
      ).toBe(true);
    }
  });
});

describe("pr-shepherd skill recurrence contract", () => {
  const skill = readFileSync(
    new URL("plugins/pr-shepherd/skills/pr-shepherd/SKILL.md", rootUrl),
    "utf8",
  );

  it("reserves human hand-off for ESCALATE", () => {
    expect(skill).toContain("`[FIX_CODE]` is always non-terminal");
    expect(skill).toContain("Only `[ESCALATE]` hands work to a human");
    expect(skill).not.toContain("instructions require a human handoff");
  });
});
