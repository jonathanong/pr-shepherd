#!/usr/bin/env node
// PreToolUse hook for Claude Code and Codex: blocks a shell command that pipes
// pr-shepherd's output (`pr-shepherd 1 | tail`). The pipe drops the `## Instructions`
// section and the generated IDs the caller must act on. It blocks only when the
// pipe is certain; anything it cannot read lets the command run.

import { pathToFileURL } from "node:url";

import { pipesShepherd } from "./pipe-guard-parse.mjs";

export const DENY_REASON =
  "Piping pr-shepherd output drops its `## Instructions` section and the IDs you must act on; run pr-shepherd without a pipe and read the full output.";

/** Parses hook stdin; returns { stdout } holding a deny decision, or "" to let the call run. Never throws. */
export function main(stdinText) {
  try {
    // Cheap prefilter: most Bash calls mention neither `pr-shepherd` nor `|`.
    if (!stdinText.includes("pr-shepherd") || !stdinText.includes("|")) return { stdout: "" };
    if (!pipesShepherd(JSON.parse(stdinText)?.tool_input?.command)) return { stdout: "" };
    const hookSpecificOutput = {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: DENY_REASON,
    };
    return { stdout: `${JSON.stringify({ hookSpecificOutput })}\n` };
  } catch {
    return { stdout: "" };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => {
    process.stdout.write(main(Buffer.concat(chunks).toString("utf8")).stdout);
  });
}
