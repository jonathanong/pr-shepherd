import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../", import.meta.url);

/** Playbooks that always apply; CLI `## Instructions` never point at them by name. */
const ALWAYS_ON_PLAYBOOKS = new Set(["Untrusted review input"]);

/**
 * `## Instructions` steps name an on-demand playbook with `Playbook: "<name>".`
 * The name must match a `###` heading in SKILL.md or the H1 of a file in
 * `skills/pr-shepherd/references/`. A typo is a dead pointer: the agent skips the
 * procedure that was moved out of the per-tick text.
 */
/** Playbooks the skill's own Dispatch bullets name (quoted); the CLI never points at them. */
const SKILL_DISPATCHED_PLAYBOOKS = new Set(["Create a PR", "MCP fallback", "Stack sessions"]);

function skillPlaybookHeadings(): Set<string> {
  const skillDir = new URL("plugins/pr-shepherd/skills/pr-shepherd/", rootUrl);
  const headings = new Set<string>();
  const skill = readFileSync(new URL("SKILL.md", skillDir), "utf8");
  for (const match of skill.matchAll(/^### (.+)$/gm)) headings.add(match[1]!.trim());
  for (const file of readdirSync(new URL("references/", skillDir))) {
    if (!file.endsWith(".md")) continue;
    const title = readFileSync(new URL(`references/${file}`, skillDir), "utf8").match(
      /^# (.+)$/m,
    )?.[1];
    if (title) headings.add(title.trim());
  }
  return headings;
}

function pointedPlaybookNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/Playbook: "([^"]+)"/g)) names.push(match[1]!);
  for (const match of text.matchAll(/playbookPointer\("([^"]+)"\)/g)) names.push(match[1]!);
  return names;
}

describe("CLI instruction pointers name real pr-shepherd skill playbooks", () => {
  const headings = skillPlaybookHeadings();

  it("SKILL.md declares at least one ### playbook heading", () => {
    expect(headings.size).toBeGreaterThan(0);
  });

  it("every pointer in snapshots or instruction source names an existing playbook", () => {
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
    const sources = dirs.map((dir) => ({
      label: dir.name,
      text: readFileSync(new URL(`${dir.name}/output.text.md`, snapshotsDir), "utf8"),
    }));
    const srcDir = new URL("src/", rootUrl);
    for (const file of readdirSync(srcDir, { recursive: true })) {
      if (
        typeof file !== "string" ||
        !file.endsWith(".mts") ||
        file.endsWith(".test.mts") ||
        file.endsWith("playbook-pointer.mts")
      ) {
        continue;
      }
      sources.push({
        label: file,
        text: readFileSync(new URL(file, srcDir), "utf8"),
      });
    }
    for (const source of sources) {
      for (const name of pointedPlaybookNames(source.text)) {
        foundNames.add(name);
        expect(
          headings.has(name),
          `"${name}" (from ${source.label}) has no matching playbook heading`,
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
      if (ALWAYS_ON_PLAYBOOKS.has(heading) || SKILL_DISPATCHED_PLAYBOOKS.has(heading)) continue;
      expect(
        foundNames.has(heading),
        `playbook "${heading}" is never pointed to from snapshots or instruction source`,
      ).toBe(true);
    }
    for (const heading of ALWAYS_ON_PLAYBOOKS) {
      expect(
        foundNames.has(heading),
        `always-on playbook "${heading}" must not be pointed to from snapshots or source`,
      ).toBe(false);
    }
  });

  it("names every skill-dispatched playbook in a SKILL.md Dispatch bullet", () => {
    const skill = readFileSync(
      new URL("plugins/pr-shepherd/skills/pr-shepherd/SKILL.md", rootUrl),
      "utf8",
    );
    for (const name of SKILL_DISPATCHED_PLAYBOOKS) {
      expect(headings.has(name), `missing playbook "${name}"`).toBe(true);
      expect(skill, `SKILL.md never names "${name}"`).toContain(`"${name}" playbook`);
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
    expect(skill).toMatch(/Run `pr-shepherd \[PR \.\.\.\] --until-terminal`/);
    expect(skill).toMatch(/pr-shepherd --stack PR --until-terminal/);
    expect(skill).toContain("Do not run `pr-shepherd iterate`");
  });

  it("repeats the dispatcher until CANCEL or ESCALATE", () => {
    expect(skill).toMatch(/rerun that same command immediately/i);
    expect(skill).toContain("[CANCEL]");
    expect(skill).toContain("[ESCALATE]");
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
