// node --test evals/outcomes/invariants.test.mjs
// Covers the arm-isolation checks: the generated suite (generated-checks.mjs)
// and a kept run's trace, mock calls and mocks/ (isolation.mjs).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkGenerated } from "./generated-checks.mjs";
import { cliAnswerFaithful, inspectRun, parseCliMock } from "./isolation.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLUGIN = join(REPO, "plugins", "pr-shepherd");
const OUT = join(REPO, "evals-outcomes-test");

describe("generated suite", () => {
  execFileSync("node", ["evals/outcomes/generate.mjs", "--out", "evals-outcomes-test"], {
    cwd: REPO,
    stdio: "ignore",
  });
  const cases = join(OUT, "cases");
  const slug = readdirSync(cases).find((s) => s.startsWith("01-"));
  after(() => rmSync(OUT, { recursive: true, force: true }));

  it("is clean as generated", () => assert.deepEqual(checkGenerated(OUT, PLUGIN), []));

  it("rejects a mock dir no plugin server declares", () => {
    const dir = join(cases, slug, "mocks", "ghost");
    mkdirSync(dir, { recursive: true });
    assert.match(checkGenerated(OUT, PLUGIN).join("\n"), /ghost is not a declared plugin server/);
    rmSync(dir, { recursive: true });
  });

  it("rejects Shepherd wording a baseline arm can see", () => {
    for (const f of ["prompt.md", join("mocks", "gh", "gh.md"), join("graders", "outcome.md")]) {
      appendFileSync(join(cases, slug, f), "\nShepherd printed nextCheck.\n");
      assert.match(
        checkGenerated(OUT, PLUGIN).join("\n"),
        new RegExp(`${slug}/.*baseline-visible`),
      );
      rmSync(join(cases, slug), { recursive: true });
      execFileSync("node", ["evals/outcomes/generate.mjs", "--out", "evals-outcomes-test"], {
        cwd: REPO,
        stdio: "ignore",
      });
    }
  });

  it("allows Shepherd in the skill-fired grader", () => {
    appendFileSync(join(cases, slug, "graders", "skill-fired.md"), "\npr-shepherd\n");
    assert.deepEqual(checkGenerated(OUT, PLUGIN), []);
  });

  it("rejects a skills copy that differs from the source", () => {
    appendFileSync(join(OUT, "skills", "pr-shepherd", "SKILL.md"), "\nedited\n");
    assert.match(checkGenerated(OUT, PLUGIN).join("\n"), /SKILL\.md differs from source/);
  });
});

describe("cliAnswerFaithful", () => {
  const mock = parseCliMock("rule\n\n===\nPR #1 [WAIT]\n\nnext\n===\n\n===\nPR #2 [CANCEL]\n===\n");
  it("takes a block, a concatenation of blocks, verbatim body text and the unrecognized error", () => {
    assert.ok(cliAnswerFaithful("PR #1 [WAIT]\nnext", mock));
    assert.ok(cliAnswerFaithful("PR #1 [WAIT] next\n\nPR #2 [CANCEL]", mock));
    assert.ok(cliAnswerFaithful("rule", mock));
    assert.ok(cliAnswerFaithful("error: unrecognized arguments\nexit code 2", mock));
  });
  it("rejects text no block supplies", () => {
    assert.ok(!cliAnswerFaithful("PR #1 [WAIT] next and a merge step", mock));
    assert.ok(!cliAnswerFaithful("PR #2 [CANCEL] PR #3 [CANCEL]", mock));
  });
});

describe("inspectRun", () => {
  const dirs = [];
  after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const MOCK = "===\nPR #1 [WAIT]\n===\n";
  const jsonl = (rows) => `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;

  function run({ servers, tools = [], slash = [], mocks, calls = [] }) {
    const out = mkdtempSync(join(tmpdir(), "isolation-"));
    dirs.push(out);
    const init = {
      type: "system",
      subtype: "init",
      mcp_servers: servers.map((name) => ({ name })),
      tools,
      slash_commands: slash,
    };
    writeFileSync(join(out, "trace.jsonl"), jsonl([init]));
    writeFileSync(join(out, "mock-calls.jsonl"), jsonl(calls));
    mkdirSync(join(out, "mocks"));
    for (const m of mocks) writeFileSync(join(out, "mocks", m), "{}");
    return out;
  }
  const BASE = ["gh.json", "github.json"];
  const WITH = [...BASE, "plugin_pr-shepherd_cli.json"];
  const cli = (output) => ({ server: "cli", tool: "pr-shepherd", verdict: "ok", output });

  it("passes a clean baseline and counts its tool errors", () => {
    const out = run({
      servers: ["gh", "github"],
      mocks: BASE,
      calls: [{ server: "gh", tool: "gh", verdict: "tool_error" }],
    });
    const r = inspectRun("without", out, "");
    assert.deepEqual([r.violations, r.void, r.toolErrors], [[], null, 1]);
  });

  it("flags every way a baseline can see Shepherd", () => {
    const out = run({
      servers: ["gh", "github", "pr-shepherd"],
      tools: ["mcp__pr-shepherd__stack"],
      slash: ["pr-shepherd:pr-shepherd"],
      mocks: [...BASE, "pr-shepherd.json"],
      calls: [{ server: "pr-shepherd", tool: "stack" }],
    });
    assert.equal(inspectRun("without", out, "").violations.length, 4);
  });

  it("refuses a run whose files are gone", () => {
    assert.match(inspectRun("with", join(tmpdir(), "no-such-run"), MOCK).violations[0], /missing/);
  });

  it("passes a plugin run that copied the recorded answer", () => {
    const out = run({
      servers: ["plugin:pr-shepherd:cli", "gh", "github"],
      mocks: WITH,
      calls: [cli("PR #1 [WAIT]")],
    });
    const r = inspectRun("with", out, MOCK);
    assert.deepEqual([r.violations, r.void, r.cliCalls], [[], null, 1]);
  });

  it("voids a plugin run that never called cli", () => {
    const out = run({ servers: ["plugin:pr-shepherd:cli", "gh", "github"], mocks: WITH });
    assert.equal(inspectRun("with", out, MOCK).void, "cli-never-called");
  });

  it("voids a plugin run whose cli answer was composed", () => {
    const out = run({
      servers: ["plugin:pr-shepherd:cli", "gh", "github"],
      mocks: WITH,
      calls: [cli("PR #1 [MERGE]")],
    });
    assert.equal(inspectRun("with", out, MOCK).void, "cli-mock-drift");
  });

  it("refuses a plugin run without the cli server or its mock", () => {
    const out = run({ servers: ["gh", "github"], mocks: BASE });
    assert.equal(inspectRun("with", out, MOCK).violations.length, 2);
  });
});
