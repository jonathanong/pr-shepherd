import { getRepoInfo } from "../github/client.mts";
import { resolveLogPath } from "../log/log-file.mts";

interface LogFileResult {
  path: string;
}

export async function runLogFile(): Promise<LogFileResult> {
  const { owner, name } = await getRepoInfo();
  const path = await resolveLogPath({ owner, repo: name });
  return { path };
}
