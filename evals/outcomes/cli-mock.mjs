// The with-arm's `pr-shepherd` CLI runner mock (mocks/cli/pr-shepherd.md).
//
// plugin eval's fixed mocks answer a tool with one canned text and cannot route
// on the call's `args`, so this is an agent mock: the judge model plays the CLI
// and prints the scenario's recorded answer for the subcommand it is given.
// A scenario's `shepherd` overrides (`iterate`, `stack`, `apply`, `suggest`)
// were written for the retired MCP tools: a string is a verbatim answer, and an
// `---\ntype: agent\n---` body is a routing rule that picks one answer from the
// call. Both are folded into the one CLI body below.

const AGENT_HEAD = /^---\ntype: agent\n---\n\n/;

const NOT_A_STACK = "Error: PR #42 is not part of a native GitHub stack";

/** Maps the MCP-tool wording of a routing rule onto the CLI's. */
const cliWording = (text) =>
  text
    .replace(/the pr-shepherd MCP `(\w+)` tool/g, "the `pr-shepherd $1` command")
    .replace(/the call's `pr` or `prs`/g, "the call's PR arguments")
    .replace(/the call's `refs`/g, "the call's PR or stack arguments")
    .replaceAll(
      "call `stack` again with `merge`, `mergeReady` or `mergeThrough`",
      "rerun `pr-shepherd stack` with `--merge`, `--merge-ready` or `--merge-through PR`",
    );

/** One subcommand's answer: a verbatim block, or a routing rule the model applies. */
const section = (label, answer) => {
  const text = answer.trim();
  return AGENT_HEAD.test(answer)
    ? `### ${label}\n\nRouting rule for this subcommand. Follow it and print what it selects.\n\n${cliWording(answer.replace(AGENT_HEAD, "").trim())}`
    : `### ${label}\n\nAnswer with exactly the text between the === lines.\n\n===\n${text}\n===`;
};

export function cliBody(spec, tick) {
  const s = spec.shepherd ?? {};
  const stack = typeof s.stack === "function" ? s.stack(tick) : s.stack;
  const stackAnswer = stack ?? (spec.tags.includes("stack") ? tick : NOT_A_STACK);
  return `---
type: agent
---

You are the \`pr-shepherd\` CLI in a checkout of owner/repo, authenticated as
\`you\`, the author of PR #42. A call gives \`args\`, the text after
\`pr-shepherd\`. Answer exactly what the CLI would print: stdout, or stderr
followed by \`exit code N\`. Print nothing else: no commentary, no summary, no
code fence, and never shorten, reformat or reorder the printed text.

Pick the subcommand from the first word of \`args\`:

- \`stack\`: STACK.
- \`apply\`: APPLY.
- \`suggest\`: SUGGEST.
- anything else: ITERATE, but only when every argument is a PR number, PR URL
  or \`owner/repo#N\`, or one of \`--until-terminal\`, \`--merge\`,
  \`--merge-ready\`, \`--merge-through PR\` and \`--format json|text\`, or
  there are no arguments. If any other word or flag appears, a first word that
  is not a subcommand included, print exactly \`error: unrecognized arguments\`
  then \`exit code 2\`, and nothing else. Never compose an answer for a call
  you cannot match.

Flags map to the options a routing rule may name: \`--merge\` is merge,
\`--merge-ready\` is mergeReady, \`--merge-through PR\` is mergeThrough. Every
call runs to the same answer whether or not it carries \`--until-terminal\`,
\`--merge\` or the other flags, unless a routing rule says otherwise. Earlier
calls are in your history: keep later answers consistent with them.

${section("ITERATE", s.iterate?.(tick) ?? tick)}

${section("STACK", stackAnswer)}

${section("APPLY", s.apply ?? "Applied every requested operation.")}

${section("SUGGEST", s.suggest ?? "No eligible suggestion patches.")}`;
}
