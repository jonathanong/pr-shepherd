import { getCurrentPrNumber } from "../github/client.mts";
import { loadConfig } from "../config/load.mts";
import type { GlobalOptions } from "../types.mts";

export interface MonitorCommandOptions extends GlobalOptions {
  prNumber?: number;
}

export interface MonitorResult {
  prNumber: number;
  loopTag: string;
  /** The full args string to pass to /loop via Skill: "<interval> --max-turns N --expires Nh\n\n<prompt>" */
  loopInvocation: string;
  /** The bare loop prompt body (for inline single-iteration use). */
  loopPrompt: string;
}

export async function runMonitor(opts: MonitorCommandOptions): Promise<MonitorResult> {
  const config = loadConfig();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  const { interval, maxTurns, expiresHours } = config.watch;
  const loopTag = `# pr-shepherd-loop:pr=${prNumber}`;
  const loopPrompt = buildLoopPrompt(prNumber, loopTag);
  const loopArgs = `${interval} --max-turns ${maxTurns} --expires ${expiresHours}h`;
  const loopInvocation = `${loopArgs}\n\n${loopPrompt}`;

  return { prNumber, loopTag, loopInvocation, loopPrompt };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatMonitorResult(result: MonitorResult): string {
  const { prNumber, loopTag, loopInvocation, loopPrompt } = result;

  return [
    `# PR #${prNumber} [MONITOR]`,
    "",
    `Loop tag: \`${loopTag}\``,
    "",
    "## Loop prompt",
    "",
    loopPrompt,
    "",
    "## Loop invocation",
    "",
    "```loop",
    loopInvocation,
    "```",
    "",
    "## Instructions",
    "",
    `1. Run \`CronList\`. If any job's prompt contains \`${loopTag}\`, run the loop prompt in \`## Loop prompt\` once inline (as if it were a cron tick) then stop — do not create a duplicate loop.`,
    `2. Otherwise, invoke the \`/loop\` skill via the Skill tool, passing the entire contents of the \`\`\`loop\`\`\` block above as the \`args\` parameter (include the interval/flags line and the blank line and the full prompt body).`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildLoopPrompt(prNumber: number, loopTag: string): string {
  return [
    loopTag,
    "",
    "**IMPORTANT — recurrence rules:**",
    "- **Do NOT call `ScheduleWakeup` or `/loop`.** This session is fired by a recurring cron job. Either call creates a duplicate runner, causing concurrent git operations and `.git/index.lock` collisions.",
    "- End the turn cleanly after completing the actions below. The cron job handles the next fire.",
    "",
    `**Self-dedup:** Run \`CronList\`. If more than one job contains \`${loopTag}\`, keep the lowest job ID and \`CronDelete\` the rest (ignore errors — a concurrent runner may have already deleted them).`,
    "",
    "Run in a single Bash call:",
    `  npx pr-shepherd iterate ${prNumber} --no-cache`,
    "",
    "Exit codes 0–3 are all valid. If the command crashes (non-zero exit, no markdown output starting with `# PR #" +
      prNumber +
      " [`), log the first line of stderr and continue — do not cancel the loop. The next cron fire will retry.",
    "",
    "The output is Markdown. The first line is an H1 heading of the form `# PR #<N> [<ACTION>]`. Every output ends with a `## Instructions` section — follow those numbered steps exactly.",
  ].join("\n");
}
