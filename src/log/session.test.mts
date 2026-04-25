import { describe, it, expect, vi } from "vitest";
import {
  buildSessionHeader,
  formatRequestEntry,
  formatResponseEntry,
  formatOutputEntry,
} from "./session.mts";

describe("buildSessionHeader", () => {
  it("includes the ISO timestamp and command args", () => {
    const { markdown } = buildSessionHeader(["node", "bin/index.mjs", "check", "42"]);
    expect(markdown).toMatch(/^## \d{4}-\d{2}-\d{2}T/);
    expect(markdown).toContain("check 42");
    expect(markdown).toContain("pid:");
    expect(markdown).toContain("version:");
  });

  it("uses (no args) when no subcommand is given", () => {
    const { markdown } = buildSessionHeader(["node", "bin/index.mjs"]);
    expect(markdown).toContain("(no args)");
  });
});

describe("formatRequestEntry", () => {
  it("formats a GraphQL request with operation name and variables", () => {
    const out = formatRequestEntry({
      n: 1,
      kind: "GraphQL",
      method: "POST",
      url: "https://api.github.com/graphql",
      body: { query: "query GetViewer { viewer { login } }", variables: { owner: "acme" } },
    });
    expect(out).toContain("### #1 GraphQL request");
    expect(out).toContain("operation: `GetViewer`");
    expect(out).not.toContain("viewer { login }");
    expect(out).toContain('"owner":"acme"');
  });

  it("omits empty variables block for GraphQL", () => {
    const out = formatRequestEntry({
      n: 2,
      kind: "GraphQL",
      method: "POST",
      url: "https://api.github.com/graphql",
      body: { query: "query { viewer { login } }", variables: {} },
    });
    expect(out).not.toContain("variables:");
  });

  it("formats a REST request with body", () => {
    const out = formatRequestEntry({
      n: 3,
      kind: "REST",
      method: "POST",
      url: "https://api.github.com/repos/acme/foo/issues",
      body: { title: "Bug" },
    });
    expect(out).toContain("### #3 REST request — POST");
    expect(out).toContain('"title":"Bug"');
  });

  it("formats a REST request without body as (no body)", () => {
    const out = formatRequestEntry({
      n: 4,
      kind: "REST",
      method: "GET",
      url: "https://api.github.com/repos/acme/foo",
    });
    expect(out).toContain("(no body)");
  });

  it("formats a restText request with no body logged", () => {
    const out = formatRequestEntry({
      n: 5,
      kind: "restText",
      method: "GET",
      url: "https://api.github.com/logs/123",
    });
    expect(out).toContain("### #5 restText request");
    expect(out).toContain("(body omitted: log artifact)");
  });
});

describe("formatResponseEntry", () => {
  it("formats a successful GraphQL response", () => {
    const out = formatResponseEntry({
      n: 1,
      kind: "GraphQL",
      method: "POST",
      url: "https://api.github.com/graphql",
      status: 200,
      durationMs: 312,
      body: { data: { viewer: { login: "alice" } } },
    });
    expect(out).toContain("### #1 GraphQL response — 200 · 312ms");
    expect(out).toContain('"login":"alice"');
  });

  it("formats a failed GraphQL response with textBody", () => {
    const out = formatResponseEntry({
      n: 2,
      kind: "GraphQL",
      method: "POST",
      url: "https://api.github.com/graphql",
      status: 401,
      durationMs: 55,
      textBody: "Unauthorized",
    });
    expect(out).toContain("401 · 55ms");
    expect(out).toContain("Unauthorized");
  });

  it("includes attempt marker when attempt is set", () => {
    const out = formatResponseEntry({
      n: 3,
      kind: "GraphQL",
      method: "POST",
      url: "https://api.github.com/graphql",
      status: 200,
      durationMs: 100,
      attempt: 2,
      body: { data: null },
    });
    expect(out).toContain("attempt 2/2 after 401");
  });

  it("formats a REST response with content-type and body", () => {
    const out = formatResponseEntry({
      n: 4,
      kind: "REST",
      method: "GET",
      url: "https://api.github.com/repos/acme/foo",
      status: 200,
      durationMs: 88,
      contentType: "application/json",
      body: { id: 1 },
    });
    expect(out).toContain("content-type: application/json");
    expect(out).toContain('"id":1');
  });

  it("includes content-length in header when both contentType and contentLength are set", () => {
    const out = formatResponseEntry({
      n: 4,
      kind: "REST",
      method: "GET",
      url: "https://api.github.com/repos/acme/foo",
      status: 200,
      durationMs: 88,
      contentType: "application/json",
      contentLength: 512,
    });
    expect(out).toContain("application/json · 512 bytes");
  });

  it("formats a restText response with content-length, no body", () => {
    const out = formatResponseEntry({
      n: 5,
      kind: "restText",
      method: "GET",
      url: "https://storage.example.com/logs/job.txt",
      status: 200,
      durationMs: 720,
      contentLength: 1248912,
    });
    expect(out).toContain("1248912 bytes (body not logged)");
    expect(out).not.toContain("```");
  });

  it("formats a restText response with no content-length", () => {
    const out = formatResponseEntry({
      n: 6,
      kind: "restText",
      method: "GET",
      url: "https://storage.example.com/logs/job.txt",
      status: 200,
      durationMs: 100,
    });
    expect(out).toContain("(body not logged)");
  });
});

describe("formatOutputEntry", () => {
  it("wraps text output in a fenced block", () => {
    const out = formatOutputEntry("hello world\n", "text");
    expect(out).toContain("### Output (text)");
    expect(out).toContain("hello world");
    expect(out).toContain("```");
  });

  it("wraps json output with json lang tag", () => {
    const out = formatOutputEntry('{"status":"ok"}', "json");
    expect(out).toContain("### Output (json)");
    expect(out).toContain("```json");
  });
});

describe("truncation", () => {
  it("truncates when MAX_BODY env is set before module load", async () => {
    const saved = process.env["PR_SHEPHERD_LOG_MAX_BODY"];
    try {
      process.env["PR_SHEPHERD_LOG_MAX_BODY"] = "5";
      vi.resetModules();
      const { formatResponseEntry: freshFmt } = await import("./session.mts");
      const out = freshFmt({
        n: 1,
        kind: "GraphQL",
        method: "POST",
        url: "https://api.github.com/graphql",
        status: 200,
        durationMs: 10,
        textBody: "a".repeat(20),
      });
      expect(out).toContain("truncated");
      expect(out).toContain("characters");
    } finally {
      vi.resetModules();
      if (saved === undefined) delete process.env["PR_SHEPHERD_LOG_MAX_BODY"];
      else process.env["PR_SHEPHERD_LOG_MAX_BODY"] = saved;
    }
  });
});
