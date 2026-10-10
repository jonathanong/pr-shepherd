export type GithubTransport = "auto" | "graphql" | "rest";

export function parseGithubTransport(value: unknown): GithubTransport {
  if (value === "auto" || value === "graphql" || value === "rest") return value;
  throw new Error('transport must be one of "auto", "graphql", or "rest"');
}
