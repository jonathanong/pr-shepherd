import type { CheckRun } from "../types.mts";

const CODSPEED_TOKEN = "codspeed";
const CODECOV_TOKEN = "codecov";
const CODECOV_MISSING_BASE_REPORT = "no coverage information found on base report";

function checkHaystack(check: CheckRun): string {
  return [check.name, check.workflowName, check.detailsUrl, check.summary]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join("\n")
    .toLowerCase();
}

/** CodSpeed app checks and any context whose name, workflow, URL, or summary mentions CodSpeed. */
function isCodSpeedCheck(check: CheckRun): boolean {
  return checkHaystack(check).includes(CODSPEED_TOKEN);
}

/**
 * Codecov "No coverage information found on base report" — a missing base upload,
 * not a coverage regression on the PR.
 */
function isCodecovMissingBaseReport(check: CheckRun): boolean {
  const text = checkHaystack(check);
  return text.includes(CODECOV_TOKEN) && text.includes(CODECOV_MISSING_BASE_REPORT);
}

/** Built-in ignore rules applied in addition to `ignoreChecks`. */
export function isBuiltinIgnoredCheck(check: CheckRun): boolean {
  return isCodSpeedCheck(check) || isCodecovMissingBaseReport(check);
}
