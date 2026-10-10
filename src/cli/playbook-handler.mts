import { EXIT, ShepherdError } from "../exit-codes.mts";
import { formatPlaybookResult, runPlaybook } from "../commands/playbook.mts";
import { maybePrintHelp } from "./help.mts";

/**
 * Print a playbook shipped in the package, or list the names. Local read only: no GitHub,
 * git, or log I/O, so playbook pointers resolve without the skill installed.
 */
export function handlePlaybook(args: string[]): void {
  if (maybePrintHelp(args, "playbook")) return;
  let format: "text" | "json" = "text";
  const words: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--format" || arg.startsWith("--format=")) {
      const value = arg === "--format" ? args[++index] : arg.slice("--format=".length);
      if (value !== "text" && value !== "json") return usageError(`invalid --format ${value}`);
      format = value;
    } else if (arg.startsWith("-")) {
      return usageError(`unknown flag ${arg}`);
    } else {
      words.push(arg);
    }
  }
  try {
    const result = runPlaybook(words.join(" "));
    process.stdout.write(
      format === "json" ? `${JSON.stringify(result)}\n` : `${formatPlaybookResult(result)}\n`,
    );
  } catch (error) {
    process.stderr.write(`pr-shepherd: playbook: ${String(error)}\n`);
    process.exitCode = error instanceof ShepherdError ? error.exitCode : EXIT.USAGE;
  }
}

function usageError(message: string): void {
  process.stderr.write(`pr-shepherd: playbook: ${message}\n`);
  process.exitCode = EXIT.USAGE;
}
