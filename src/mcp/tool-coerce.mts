/** Input coercion helpers for MCP tool handlers. */

export function optNum(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key];
  return typeof v === "number" ? v : undefined;
}

export function reqNum(input: Record<string, unknown>, key: string): number {
  const v = input[key];
  if (typeof v !== "number") throw new Error(`${key} is required and must be a number`);
  return v;
}

export function optStr(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" ? v : undefined;
}

export function reqStr(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== "string" || v === "") {
    throw new Error(`${key} is required and must be a non-empty string`);
  }
  return v;
}

export function optBool(input: Record<string, unknown>, key: string): boolean | undefined {
  const v = input[key];
  return typeof v === "boolean" ? v : undefined;
}

export function optStringArray(input: Record<string, unknown>, key: string): string[] | undefined {
  const v = input[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

export function reqNumArray(input: Record<string, unknown>, key: string): number[] {
  const v = input[key];
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`${key} must be a non-empty array of numbers`);
  }
  return v.filter((x): x is number => typeof x === "number");
}
