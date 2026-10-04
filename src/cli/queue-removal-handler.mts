import { EXIT, errorToExitCode } from "../exit-codes.mts";
import { applyQueueRemovalAck } from "../commands/apply-queue-removal.mts";
import { getFlag, parseCommonArgs } from "./args.mts";
import { maybePrintHelp, USAGE } from "./help.mts";

const FLAGS = new Set(["--require-sha", "--queue-commit", "--removed-at"]);

/** `apply queue-removal`; help exits before argument validation and GitHub I/O. */
export async function handleQueueRemoval(args: string[]): Promise<void> {
  if (maybePrintHelp(args, "apply queue-removal")) return;
  const { prNumber, global, extra } = parseCommonArgs(args);
  const flagError = validateFlags(extra);
  if (flagError) {
    usage(flagError);
    return;
  }
  const headSha = getFlag(extra, "--require-sha");
  const queueCommitOid = getFlag(extra, "--queue-commit");
  const removedAtText = getFlag(extra, "--removed-at");
  if (headSha === null || !/^[0-9a-f]{40}$/.test(headSha)) {
    usage("--require-sha must be a full 40-character lowercase hex SHA.", EXIT.DATAERR);
    return;
  }
  if (queueCommitOid === null || !/^[0-9a-f]{40}$/.test(queueCommitOid)) {
    usage("--queue-commit must be a full 40-character lowercase hex SHA.", EXIT.DATAERR);
    return;
  }
  if (removedAtText === null || !/^[1-9]\d*$/.test(removedAtText)) {
    usage("--removed-at must be a positive Unix timestamp in seconds.", EXIT.DATAERR);
    return;
  }
  const removedAtUnix = Number(removedAtText);
  if (!Number.isSafeInteger(removedAtUnix)) {
    usage("--removed-at must be a positive Unix timestamp in seconds.", EXIT.DATAERR);
    return;
  }
  try {
    const result = await applyQueueRemovalAck({
      prNumber,
      targetRepository: global.targetRepository,
      headSha,
      queueCommitOid,
      removedAtUnix,
    });
    const body =
      global.format === "json"
        ? JSON.stringify(result, null, 2)
        : [
            `PR: ${result.repo}#${result.pr}`,
            `headSha: ${result.acknowledgment.headSha}`,
            `queueCommitOid: ${result.acknowledgment.queueCommitOid}`,
            `removedAtUnix: ${result.acknowledgment.removedAtUnix}`,
          ].join("\n");
    process.stdout.write(`${body}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`pr-shepherd: apply queue-removal: ${message}\n`);
    process.exitCode = errorToExitCode(err);
  }
}

function validateFlags(args: string[]): string | null {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) return `unexpected argument: "${arg}"`;
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (!FLAGS.has(name)) return `unknown flag: "${name}"`;
    if (eq !== -1) {
      if (arg.slice(eq + 1) === "") return `${name} requires a value.`;
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) return `${name} requires a value.`;
    i += 1;
  }
  return null;
}

function usage(message: string, exitCode: number = EXIT.USAGE): void {
  process.stderr.write(`pr-shepherd: apply queue-removal: ${message}\n`);
  if (exitCode === EXIT.USAGE) process.stderr.write(`${USAGE["apply queue-removal"]}\n`);
  process.exitCode = exitCode;
}
