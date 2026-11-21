export declare function isBalanced(text: string): boolean;
export declare function splitCommands(masked: string): { text: string; term: "pipe" | "flow" }[];
export declare function runsShepherd(words: string[]): boolean;
export declare function redirectsStdout(text: string): boolean;
export declare function pipesShepherd(command: unknown): boolean;
