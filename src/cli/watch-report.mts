import { EXIT } from "../exit-codes.mts";
import type { WatchHolder, WatchRepo } from "../state/watch-lock.mts";

export interface WatchedReport {
  mode: "watch-lock";
  repo: string;
  alreadyWatched: Array<{ pr: number; pid: number; flags: string[] }>;
  instructions: string[];
}

export function buildWatchedReport(repo: WatchRepo, holders: WatchHolder[]): WatchedReport {
  const lines = holders.map(({ pr, pid, flags }) => {
    const shown = flags.length > 0 ? flags.join(" ") : "none";
    return `PR #${pr} is already watched by PID ${pid} (flags: ${shown}).`;
  });
  const pids = [...new Set(holders.map((holder) => holder.pid))].join(", ");
  const steps = [
    ...lines,
    "Do not start another watcher for a PR listed above; the process that holds it already polls it.",
    `If its flags differ from what you need (for example you need \`--merge\` and it lacks it), stop PID ${pids} and rerun this command.`,
  ];
  return {
    mode: "watch-lock",
    repo: `${repo.owner}/${repo.name}`,
    alreadyWatched: holders.map(({ pr, pid, flags }) => ({ pr, pid, flags })),
    instructions: steps.map((step, index) => `${index + 1}. ${step}`),
  };
}

export function formatWatchedReport(report: WatchedReport): string {
  const prs = report.alreadyWatched.map((item) => `#${item.pr}`).join(", ");
  return `## Already watched\n\n${report.repo} ${prs}\n\n## Instructions\n\n${report.instructions.join("\n")}`;
}

/** Every requested PR is watched elsewhere: print the report on stdout and exit with `EXIT.WATCHED`. */
export function emitWatched(
  repo: WatchRepo,
  holders: WatchHolder[],
  format: "text" | "json",
): void {
  const report = buildWatchedReport(repo, holders);
  process.stdout.write(
    format === "json" ? `${JSON.stringify(report)}\n` : `${formatWatchedReport(report)}\n`,
  );
  process.exitCode = EXIT.WATCHED;
}

/** Some PRs are watched elsewhere; this run continues on the rest, so the note goes to stderr. */
export function noteWatched(repo: WatchRepo, holders: WatchHolder[]): void {
  process.stderr.write(`${formatWatchedReport(buildWatchedReport(repo, holders))}\n`);
}
