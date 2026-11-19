// Arm isolation and CLI-mock fidelity checks over one kept run (`out/` dir:
// trace.jsonl, mock-calls.jsonl, mocks/). Used by analyze.mjs. See RUNNING.md.
//
// A violation means the run's arm was not what it claims (the baseline saw
// Shepherd, or the plugin arm had no CLI): the analysis must refuse. A void
// means this one run is unusable but the arm itself was sound.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASELINE_SERVERS = ["gh", "github"];
const WITHOUT_MOCKS = ["gh.json", "github.json"];
const WITH_MOCKS = [...WITHOUT_MOCKS, "plugin_pr-shepherd_cli.json"].sort();
export const PLUGIN_CLI = "plugin:pr-shepherd:cli";
// What the CLI mock prints for a call it does not recognise (see cli-mock.mjs).
export const UNRECOGNIZED = "error: unrecognized arguments exit code 2";

export const normalize = (s) => String(s).replace(/\s+/g, " ").trim();

const jsonLines = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });

/** The `===` answers of a served cli mock, plus its whole normalized body. */
export function parseCliMock(text) {
  const blocks = [];
  for (const m of text.matchAll(/^===[^\n]*\n([\s\S]*?)\n===$/gm)) blocks.push(normalize(m[1]));
  return { blocks, body: normalize(text) };
}

/** Whether `answer` is one block, a concatenation of blocks (a multi-PR answer), or verbatim body text. */
export function cliAnswerFaithful(answer, mock) {
  const a = normalize(answer);
  if (a === UNRECOGNIZED || mock.body.includes(a)) return true;
  const memo = new Map();
  const split = (i) => {
    if (i >= a.length) return true;
    if (memo.has(i)) return memo.get(i);
    const ok = mock.blocks.some(
      (b) => b && a.startsWith(b, i) && split(i + b.length + (a[i + b.length] === " " ? 1 : 0)),
    );
    memo.set(i, ok);
    return ok;
  };
  return split(0);
}

function readInit(trace) {
  const init = jsonLines(trace).find((e) => e.type === "system" && e.subtype === "init");
  if (!init) return null;
  return {
    servers: (init.mcp_servers ?? []).map((s) => s.name),
    tools: init.tools ?? [],
    slash: init.slash_commands ?? [],
  };
}

/**
 * Inspects one run. `mockText` is the case's served mocks/cli/pr-shepherd.md.
 * Returns { violations: string[], void: string|null, toolErrors, cliCalls }.
 */
export function inspectRun(arm, outDir, mockText) {
  const res = { violations: [], void: null, toolErrors: 0, cliCalls: 0 };
  const trace = join(outDir, "trace.jsonl");
  const calls = join(outDir, "mock-calls.jsonl");
  const mocksDir = join(outDir, "mocks");
  for (const p of [trace, calls, mocksDir]) {
    if (!existsSync(p)) return { ...res, violations: [`missing ${p}; rerun with --keep-temp`] };
  }
  const init = readInit(trace);
  if (!init) return { ...res, violations: ["trace has no system init"] };
  const records = jsonLines(calls).filter((r) => r.server);
  const mocks = readdirSync(mocksDir).sort();
  res.toolErrors = records.filter((r) => r.verdict && r.verdict !== "ok").length;
  const cli = records.filter((r) => r.server === "cli" && r.tool);
  res.cliCalls = cli.length;

  if (arm === "without") {
    const extra = [...new Set([...records.map((r) => r.server), ...init.servers])].filter(
      (s) => !BASELINE_SERVERS.includes(s),
    );
    if (extra.length) res.violations.push(`servers beyond gh/github: ${extra.join(", ")}`);
    const tool = init.tools.filter((t) => /shepherd/i.test(t));
    if (tool.length) res.violations.push(`shepherd tools visible: ${tool.join(", ")}`);
    const slash = init.slash.filter((c) => c.startsWith("pr-shepherd:"));
    if (slash.length) res.violations.push(`pr-shepherd slash commands: ${slash.join(", ")}`);
    if (mocks.join() !== WITHOUT_MOCKS.join()) {
      res.violations.push(`mocks/ is [${mocks}], want [${WITHOUT_MOCKS}]`);
    }
    return res;
  }

  if (!init.servers.includes(PLUGIN_CLI))
    res.violations.push(`init mcp_servers lacks ${PLUGIN_CLI}`);
  if (mocks.join() !== WITH_MOCKS.join()) {
    res.violations.push(`mocks/ is [${mocks}], want [${WITH_MOCKS}]`);
  }
  if (res.violations.length) return res;
  if (!cli.length) return { ...res, void: "cli-never-called" };
  const mock = parseCliMock(mockText);
  if (cli.some((r) => typeof r.output === "string" && !cliAnswerFaithful(r.output, mock))) {
    res.void = "cli-mock-drift";
  }
  return res;
}
