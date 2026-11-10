#!/usr/bin/env node
// PreToolUse hook for Claude Code and Codex: flags shell commands that poll
// GitHub PR or CI state instead of running one `pr-shepherd … --until-terminal`.
//
// Level: PR_SHEPHERD_POLL_GUARD, else the Claude Code plugin option `poll_guard`
// (CLAUDE_PLUGIN_OPTION_POLL_GUARD): `disabled`, `advisory` (default: the call
// runs and the agent gets a note), or `fail` (the call is blocked with the reason).
// Any unexpected error lets the call run.

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { detectPoller, expandPath, guardMessage, readLevel } from "./poll-guard-detect.mjs";

const MAX_SCRIPT_BYTES = 64 * 1024;

/** Decides the hook result for one tool call. Returns { stdout, stderr, code }. */
export function runGuard(input, env, readText = readSmallFile) {
  const { level, error } = readLevel({
    PR_SHEPHERD_POLL_GUARD: env.PR_SHEPHERD_POLL_GUARD || env.CLAUDE_PLUGIN_OPTION_POLL_GUARD,
  });
  if (error) return { stdout: "", stderr: `${error}\n`, code: 1 };
  if (level === "disabled") return { stdout: "", stderr: "", code: 0 };

  const command = input?.tool_input?.command;
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const readScript = (path) => {
    const expanded = expandPath(path, env);
    return readText(isAbsolute(expanded) ? expanded : resolve(cwd, expanded));
  };
  const found = detectPoller(command, readScript);
  if (!found) return { stdout: "", stderr: "", code: 0 };

  const message = guardMessage(found);
  const hookSpecificOutput =
    level === "fail"
      ? {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: message,
        }
      : { hookEventName: "PreToolUse", additionalContext: message };
  return { stdout: `${JSON.stringify({ hookSpecificOutput })}\n`, stderr: "", code: 0 };
}

/** Reads a regular file up to 64 KiB; returns null otherwise. */
export function readSmallFile(path) {
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > MAX_SCRIPT_BYTES) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Parses hook stdin and runs the guard; never throws. */
export function main(stdinText, env) {
  try {
    return runGuard(JSON.parse(stdinText), env);
  } catch {
    return { stdout: "", stderr: "", code: 0 };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => {
    const result = main(Buffer.concat(chunks).toString("utf8"), process.env);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.code;
  });
}
