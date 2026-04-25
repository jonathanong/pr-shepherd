import { initLog, appendEntry } from "./log-file.mts";
import { buildSessionHeader, formatOutputEntry } from "./session.mts";
import { getRepoInfo } from "../github/client.mts";

let _done = false;

function detectFormat(argv: string[]): "text" | "json" {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--format=json") return "json";
    if (argv[i] === "--format" && argv[i + 1] === "json") return "json";
  }
  return "text";
}

/**
 * Initialize the per-worktree log, write the session header, and install a
 * stdout tee that routes all CLI output to the log. No-op after the first call.
 * Silently skips logging when not in a git repo or on any other error.
 */
export async function setupLog(argv: string[]): Promise<void> {
  if (_done) return;
  _done = true;

  try {
    const { owner, name } = await getRepoInfo();
    await initLog({ owner, repo: name });
  } catch {
    return;
  }

  const { markdown: header } = buildSessionHeader(argv);
  appendEntry(header);

  const format = detectFormat(argv);
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void,
  ): boolean => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    if (text.length > 0) appendEntry(formatOutputEntry(text, format));
    return typeof encodingOrCb === "function"
      ? origWrite(chunk, encodingOrCb)
      : origWrite(chunk, encodingOrCb as BufferEncoding, cb);
  };
}
