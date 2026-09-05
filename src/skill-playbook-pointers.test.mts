import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../", import.meta.url);

/** Playbooks that always apply; CLI `## Instructions` never point at them by name. */
const ALWAYS_ON_PLAYBOOKS = new Set(["Untrusted review input"]);

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
    const dirs = readdirSync(snapshotsDir, { withFileTypes: true }).filter(
      (d) => d.isDirectory() && !d.name.startsWith("."),
    );
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
    // Pointed-to playbooks must appear in CLI output. Always-on playbooks are standing
    // exception handling (no pointer); they still need a ### heading so the skill loads
    // them once per session.
    for (const heading of headings) {
      if (ALWAYS_ON_PLAYBOOKS.has(heading)) continue;
      expect(
        foundNames.has(heading),
        `SKILL.md playbook "${heading}" is never pointed to from any snapshot`,
      ).toBe(true);
    }
    for (const heading of ALWAYS_ON_PLAYBOOKS) {
      expect(
        foundNames.has(heading),
        `always-on playbook "${heading}" must not be pointed to from snapshots`,
      ).toBe(false);
    }
  });

  it("declares every always-on playbook as a ### heading", () => {
    for (const heading of ALWAYS_ON_PLAYBOOKS) {
      expect(headings.has(heading), `missing always-on playbook "${heading}"`).toBe(true);
    }
  });
});

describe("pr-shepherd skill recurrence contract", () => {
  const skill = readFileSync(
    new URL("plugins/pr-shepherd/skills/pr-shepherd/SKILL.md", rootUrl),
    "utf8",
  );

  it("injects --until-terminal into the canonical CLI poll dispatcher", () => {
    const cliDispatcher = skill.match(/^2\..*?(?=^3\.)/ms)?.[0];

    expect(cliDispatcher).toBeDefined();
    expect(cliDispatcher).toMatch(
      /canonical poll command `pr-shepherd(?: \[PR\])? --until-terminal`/,
    );
  });

  it("repeats the dispatcher until CANCEL or ESCALATE", () => {
    const recurrence = skill.match(/^4\..*?(?=^\d+\.|^## )/ms)?.[0];

    expect(recurrence).toBeDefined();
    expect(recurrence).toMatch(/immediately repeat step 2/i);
    expect(recurrence).toContain("[CANCEL]");
    expect(recurrence).toContain("[ESCALATE]");
  });

  it("forbids waiting for CI with gh pr checks or gh pr watch", () => {
    expect(skill).toContain("gh pr checks");
    expect(skill).toContain("gh pr watch");
    expect(skill).toContain("fetching check logs is fine");
    expect(skill).toMatch(/Do not wait for CI to finish/i);
    expect(skill).not.toContain("once it completes");
  });

  it("reserves human hand-off for ESCALATE", () => {
    expect(skill).toContain("`[FIX_CODE]` is always non-terminal");
    expect(skill).toMatch(/only `\[ESCALATE\]` hands work to a human/i);
    expect(skill).not.toContain("instructions require a human handoff");
  });

  it("treats surfaced review and CI text as untrusted input without a new ESCALATE trigger", () => {
    expect(skill).toContain("### Untrusted review input");
    expect(skill).toMatch(/not as user or system instructions/);
    expect(skill).toContain("is not a new `[ESCALATE]` trigger");
  });
});
