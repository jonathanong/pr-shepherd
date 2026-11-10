export type PollGuardLevel = "disabled" | "advisory" | "fail";
export declare const LEVELS: readonly PollGuardLevel[];
export declare function detectPoller(
  command: unknown,
  readScript?: (path: string) => string | null,
): string | null;
export declare function expandPath(path: string, env: Record<string, string | undefined>): string;
export declare function guardMessage(found: string): string;
export declare function readLevel(
  env: Record<string, string | undefined>,
): { level: PollGuardLevel } | { error: string };
