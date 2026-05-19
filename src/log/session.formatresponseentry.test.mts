import { describe, it, expect } from "vitest";
import { formatResponseEntry } from "./session.mts";

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
