export interface GuardResult {
  stdout: string;
  stderr: string;
  code: number;
}
export declare function runGuard(
  input: unknown,
  env: Record<string, string | undefined>,
  readText?: (path: string) => string | null,
): GuardResult;
export declare function readSmallFile(path: string): string | null;
export declare function main(
  stdinText: string,
  env: Record<string, string | undefined>,
): GuardResult;
