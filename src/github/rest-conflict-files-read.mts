import type { RepoInfo } from "./client.mts";
import {
  malformedRest,
  readRestPages,
  restArray,
  restObject,
  restRepoPath,
  restString,
} from "./rest-reader-core.mts";

interface SideFile {
  filename: string;
  /** Set when this side renamed the file. */
  previous?: string;
}

function compareFiles(files: unknown[]): SideFile[] {
  return files.map((value) => {
    const file = restObject(value, "compare file");
    const filename = restString(file.filename, "compare file name");
    return typeof file.previous_filename === "string"
      ? { filename, previous: file.previous_filename }
      : { filename };
  });
}

async function readSide(
  repo: RepoInfo,
  basehead: string,
  onBody?: (body: Record<string, unknown>) => void,
): Promise<SideFile[]> {
  const pages = await readRestPages<unknown>(
    `${restRepoPath(repo)}/compare/${basehead}`,
    (body) => {
      const record = restObject(body, "compare");
      onBody?.(record);
      return restArray(record.files, "compare files");
    },
  );
  return compareFiles(pages.nodes);
}

/**
 * Files changed by the PR head and by the base branch since their merge base. GitHub exposes
 * no list of conflicting files, so this intersection is raw evidence of where a conflict can be.
 * Read through REST on both transports: GraphQL has no per-file compare.
 */
export async function readRestFilesChangedOnBothSides(
  repo: RepoInfo,
  baseRef: string,
  headRef: string,
): Promise<string[]> {
  let mergeBase: string | undefined;
  const head = await readSide(
    repo,
    `${encodeURIComponent(baseRef)}...${encodeURIComponent(headRef)}`,
    (body) => {
      mergeBase ??= restString(
        restObject(body.merge_base_commit, "compare merge base").sha,
        "compare merge base SHA",
      );
    },
  );
  if (mergeBase === undefined) malformedRest("compare merge base missing");
  const base = await readSide(repo, `${mergeBase}...${encodeURIComponent(baseRef)}`);
  // A rename on either side still matches through the name the other side changed.
  const baseNames = new Set(
    base.flatMap((file) => [file.filename, file.previous ?? file.filename]),
  );
  return head
    .filter((file) => baseNames.has(file.filename) || baseNames.has(file.previous ?? file.filename))
    .map((file) => file.filename);
}
