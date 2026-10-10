/** Native stack and exact lower prefix observed when the merge command was generated. */
export interface RestMergeStackGuard {
  number: number;
  baseRefName: string;
  prefix: Array<{
    pr: number;
    headRefName: string;
    headRefOid: string;
    baseRefName: string;
  }>;
}

export function validateRestMergeStackGuard(value: unknown): asserts value is RestMergeStackGuard {
  const guard = value as RestMergeStackGuard | null;
  if (
    !guard ||
    typeof guard !== "object" ||
    Array.isArray(guard) ||
    !Number.isSafeInteger(guard.number) ||
    guard.number < 1 ||
    typeof guard.baseRefName !== "string" ||
    !guard.baseRefName ||
    !Array.isArray(guard.prefix) ||
    guard.prefix.length === 0 ||
    guard.prefix.length > 100_000 ||
    guard.prefix.some(
      (member) =>
        !member ||
        typeof member !== "object" ||
        Array.isArray(member) ||
        !Number.isSafeInteger(member.pr) ||
        member.pr < 1 ||
        typeof member.headRefName !== "string" ||
        !member.headRefName ||
        typeof member.baseRefName !== "string" ||
        !member.baseRefName ||
        typeof member.headRefOid !== "string" ||
        !/^[0-9a-f]{40}$/.test(member.headRefOid),
    ) ||
    new Set(guard.prefix.map((member) => member.pr)).size !== guard.prefix.length
  )
    throw new Error(
      "expectedStack must bind a positive stack number, trunk, and unique ordered PR prefix with full head SHAs and branch refs",
    );
}

/** Stable equality ignores object key order and unknown caller fields. */
export function restMergeStackGuardKey(guard: RestMergeStackGuard | undefined): string {
  return JSON.stringify(
    guard
      ? [
          guard.number,
          guard.baseRefName,
          guard.prefix.map((member) => [
            member.pr,
            member.headRefName,
            member.headRefOid,
            member.baseRefName,
          ]),
        ]
      : null,
  );
}
