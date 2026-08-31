import { extractShepherdJournal } from "../journal/index.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { USAGE, maybePrintHelp } from "./help.mts";
import { readSafeBodyFile } from "./safe-body-file.mts";

/** Extracts a checked Shepherd Journal from a local PR-body file without external I/O. */
export async function handleJournalExtract(args: string[]): Promise<void> {
  if (maybePrintHelp(args, "journal extract")) return;
  const bodyFile = parseBodyFile(args);
  if (bodyFile === null) return;

  try {
    const body = await readSafeBodyFile(bodyFile);
    process.stdout.write(`${JSON.stringify(extractShepherdJournal(body))}\n`);
  } catch (error) {
    process.stderr.write(`pr-shepherd: journal extract: ${String(error)}\n`);
    process.exitCode = error instanceof ShepherdError ? error.exitCode : EXIT.NOINPUT;
  }
}

function parseBodyFile(args: string[]): string | null {
  let bodyFile: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--body-file") {
      const value = args[++index];
      if (value === undefined || value.startsWith("--") || bodyFile !== undefined) {
        return printUsage();
      }
      bodyFile = value;
      continue;
    }
    if (arg.startsWith("--body-file=")) {
      const value = arg.slice("--body-file=".length);
      if (value === "" || bodyFile !== undefined) return printUsage();
      bodyFile = value;
      continue;
    }
    return printUsage();
  }
  return bodyFile ?? printUsage();
}

function printUsage(): null {
  process.stderr.write(`${USAGE["journal extract"]}\n`);
  process.exitCode = EXIT.USAGE;
  return null;
}
