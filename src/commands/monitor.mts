import { getCurrentPrNumber } from "../github/client.mts";
import type { GlobalOptions } from "../types.mts";
import type { AgentRuntime } from "../agent-runtime.mts";
import { joinSections } from "../util/markdown.mts";

export interface MonitorCommandOptions extends GlobalOptions {
  readyDelaySuffix?: string;
  runtime?: AgentRuntime;
}

export interface MonitorResult {
  prNumber: number;
  loopTag: string;
  /** The prompt body to pass to /loop, without an interval prefix. */
  loopPrompt: string;
  reusableCommand: string;
}

export async function runMonitor(opts: MonitorCommandOptions): Promise<MonitorResult> {
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  // No space after `#` — `# text` is a CommonMark ATX heading; `#text` is not.
  // Trailing `:` prevents substring false positives if agents search for this
  // tag in conversation or task state.
  const loopTag = `#pr-shepherd-loop:pr=${prNumber}:`;
  const reusableCommand = buildIterateCommand(prNumber, opts.readyDelaySuffix);
  const loopPrompt = buildLoopPrompt(prNumber, loopTag, reusableCommand, opts.runtime ?? "claude");

  return {
    prNumber,
    loopTag,
    loopPrompt,
    reusableCommand,
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatMonitorResult(
  result: MonitorResult,
  opts?: { runtime?: AgentRuntime },
): string {
  const { prNumber, loopTag, loopPrompt } = result;
  const runtime = opts?.runtime ?? "claude";

  const sections = [
    [`# PR #${prNumber} [MONITOR]`, "", `Loop tag: \`${loopTag}\``].join("\n"),
    runtime === "codex" ? `Reusable command: \`${result.reusableCommand}\`` : null,
    "## Loop prompt",
    loopPrompt,
    "## Instructions",
    buildMonitorInstructions(result, runtime)
      .map((inst, i) => `${i + 1}. ${inst}`)
      .join("\n"),
  ];
  return joinSections(sections);
}

export function formatMonitorJson(
  result: MonitorResult,
  opts?: { runtime?: AgentRuntime },
): Record<string, unknown> {
  const runtime = opts?.runtime ?? "claude";
  const { reusableCommand, ...base } = result;
  return {
    ...base,
    ...(runtime === "codex" && { reusableCommand }),
    instructions: buildMonitorInstructions(result, runtime),
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function validateReadyDelaySuffix(readyDelaySuffix?: string): string | undefined {
  if (readyDelaySuffix === undefined) return undefined;
  const trimmed = readyDelaySuffix.trim();
  if (!/^\d+(?:m|min|minutes?|h|hours?)$/.test(trimmed)) {
    throw new Error(
      `Invalid --ready-delay: ${readyDelaySuffix}. Expected a duration like 5m, 2h, 10m, or 1h.`,
    );
  }
  return trimmed;
}

function buildIterateCommand(prNumber: number, readyDelaySuffix?: string): string {
  const validatedDelay = validateReadyDelaySuffix(readyDelaySuffix);
  return `npx pr-shepherd ${prNumber}${validatedDelay ? ` --ready-delay ${validatedDelay}` : ""}`;
}

function buildLoopPrompt(
  prNumber: number,
  loopTag: string,
  iterateCmd: string,
  runtime: AgentRuntime = "claude",
): string {
  if (runtime === "codex") {
    return [
      loopTag,
      "",
      "**IMPORTANT — Codex recurrence rules:**",
      "- Run the command below once and follow its `## Instructions` exactly.",
      "- If the output tells you to continue the active Codex goal, pick a fresh sleep/timeout between 1 and 4 minutes, wait that long, then rerun the reusable command from the monitor output.",
      "- Stop only when Shepherd emits `[CANCEL]` because the ready-delay completed or the PR was merged/closed, or when Shepherd emits `[ESCALATE]` (including `stall-timeout` for repeated unchanged CI failures).",
      "- Do not call `/loop`, `ScheduleWakeup`, `CronCreate`, or `npx pr-shepherd monitor`; Codex recurrence is explicit `iterate` command cycles.",
      "",
      "Run in a single Bash call:",
      `  ${iterateCmd}`,
      "",
      `Exit codes 0–3 are all valid. If the command crashes (non-zero exit, no markdown output starting with \`# PR #${prNumber} [\`), report the first line of stderr and stop so the user can retry.`,
      "",
      "The output is Markdown. The first line is an H1 heading of the form `# PR #<N> [<ACTION>]`. Every output ends with a `## Instructions` section — follow those numbered steps exactly.",
    ].join("\n");
  }
  return [
    loopTag,
    "",
    "**IMPORTANT — dynamic recurrence rules:**",
    "- This prompt runs in dynamic `/loop` mode. Do not invoke `/loop` again from inside this prompt; that creates a duplicate runner.",
    "- If Shepherd's `## Instructions` tell you to continue or end a nonterminal iteration, end the turn by calling `ScheduleWakeup` with `delaySeconds` between 60 and 240 and this same `## Loop prompt` body.",
    "- If Shepherd emits `[CANCEL]` or `[ESCALATE]`, follow its `## Instructions` and do not call `ScheduleWakeup`.",
    "",
    "Run in a single Bash call:",
    `  ${iterateCmd}`,
    "",
    `Exit codes 0–3 are all valid. If the command crashes (non-zero exit, no markdown output starting with \`# PR #${prNumber} [\`), log the first line of stderr and schedule a retry with \`ScheduleWakeup\` using \`delaySeconds\` between 60 and 240.`,
    "",
    "The output is Markdown. The first line is an H1 heading of the form `# PR #<N> [<ACTION>]`. Every output ends with a `## Instructions` section — follow those numbered steps exactly.",
  ].join("\n");
}

function buildMonitorInstructions(result: MonitorResult, runtime: AgentRuntime): string[] {
  if (runtime === "codex") {
    return [
      "Run the `## Loop prompt` body once inline now.",
      `For an active Codex goal, keep cycling with \`${result.reusableCommand}\`; before each rerun, pick a fresh sleep/timeout between 1 and 4 minutes. Codex does not create a \`/loop\` monitor.`,
    ];
  }
  return [
    "Invoke the `/loop` skill via the Skill tool with the full `## Loop prompt` body as `args`. Do not prefix an interval; this enters dynamic mode, where the prompt schedules each next wakeup with `ScheduleWakeup`.",
  ];
}
