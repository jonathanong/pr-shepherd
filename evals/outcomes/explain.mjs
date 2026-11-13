#!/usr/bin/env node
// Asks the judge model why outcome runs failed. `claude plugin eval` records
// only the judge's votes, so this re-judges each failed run from its kept trace
// and prints the verdict with a short reason. The re-judgment is a fresh call:
// it explains a failure, it does not replace the recorded score.
//
//   node evals/outcomes/explain.mjs <aggregate-result.json> [slug-prefix] [--all]
//
// Needs the run's `--keep-temp` traces and the `claude` CLI on PATH. Each run
// costs one judge call.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const all = args.includes("--all");
const [file, prefix = ""] = args.filter((a) => a !== "--all");
if (!file) {
  console.error("usage: explain.mjs <aggregate-result.json> [slug-prefix] [--all]");
  process.exit(2);
}

const MODEL = process.env.JUDGE_MODEL ?? "opus";
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)} …[clipped]` : s);

/** The run as the judge sees it: each tool call, its result, and the final text. */
function transcript(tracePath) {
  const out = [];
  for (const line of readFileSync(tracePath, "utf8").split("\n").filter(Boolean)) {
    const e = JSON.parse(line);
    for (const b of e.message?.content ?? []) {
      if (e.type === "assistant" && b.type === "tool_use") {
        out.push(`TOOL CALL ${b.name} ${clip(JSON.stringify(b.input), 600)}`);
      }
      if (e.type === "user" && b.type === "tool_result") {
        const text = [b.content].flat().map((c) => (typeof c === "string" ? c : (c.text ?? ""))).join("");
        out.push(`TOOL RESULT ${clip(text, 1200)}`);
      }
    }
    if (e.type === "result") out.push(`FINAL ANSWER:\n${e.result}`);
  }
  return out.join("\n");
}

function judge(criteria, run) {
  const prompt = `You graded an AI agent's run against the criteria below and it did not pass.
Re-read the run and give your verdict on the first line as PASS or FAIL, then in
two to four sentences name the exact criterion clause that decides it and the
part of the run that meets or breaks it. Quote the run where you can.

<criteria>
${criteria}
</criteria>

<run>
${run}
</run>`;
  const r = spawnSync("claude", ["-p", "--model", MODEL], { input: prompt, encoding: "utf8" });
  if (r.status !== 0) return `(judge call failed: ${r.stderr.trim().split("\n").pop()})`;
  return r.stdout.trim();
}

const agg = JSON.parse(readFileSync(file, "utf8"));
for (const c of agg.cases.filter((x) => x.name.startsWith(prefix))) {
  const criteria = c.graders.find((g) => g.type === "llm")?.graderMarkdown;
  if (!criteria) continue;
  for (const [arm, runs] of Object.entries(c.arms)) {
    runs.forEach((r, i) => {
      if (r.passed && !all) return;
      const head = `## ${c.name} [${arm === "with" ? "plugin" : "gh/MCP"}] run ${i + 1}, score ${r.score}`;
      if (r.error || !r.tracePath || !existsSync(r.tracePath)) {
        console.log(`${head}\n\n(no trace${r.error ? `; error: ${r.error}` : ""})\n`);
        return;
      }
      console.log(`${head}\n\n${judge(criteria, transcript(r.tracePath))}\n`);
    });
  }
}
