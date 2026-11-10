import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { _resetGithubApps, findGithubApp, loadGithubApps } from "./github-app-config.mts";

const FILE = "github-apps.yml";
let home: string;
const previousHome = process.env["PR_SHEPHERD_HOME"];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "apps-config-"));
  process.env["PR_SHEPHERD_HOME"] = home;
  _resetGithubApps();
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  process.env["PR_SHEPHERD_HOME"] = previousHome;
  _resetGithubApps();
});

function write(yaml: string): void {
  writeFileSync(join(home, FILE), yaml);
}

function expectConfigError(yaml: string, message: string): void {
  write(yaml);
  _resetGithubApps();
  let error: unknown;
  try {
    loadGithubApps();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ShepherdError);
  expect((error as ShepherdError).exitCode).toBe(EXIT.CONFIG);
  expect((error as ShepherdError).message).toContain(join(home, FILE));
  expect((error as ShepherdError).message).toContain(message);
}

const valid = `apps:
  - app-id: 123
    private-key-file: key.pem
    repositories:
      - Acme/*
      - other/Widget
`;

describe("github-apps.yml", () => {
  it("defaults to ~/.pr-shepherd when PR_SHEPHERD_HOME is unset", () => {
    const previousUserHome = process.env["HOME"];
    process.env["HOME"] = home;
    delete process.env["PR_SHEPHERD_HOME"];
    try {
      mkdirSync(join(home, ".pr-shepherd"));
      writeFileSync(join(home, ".pr-shepherd", FILE), valid);
      expect(loadGithubApps()[0]?.privateKeyFile).toBe(join(homedir(), ".pr-shepherd", "key.pem"));
    } finally {
      process.env["HOME"] = previousUserHome;
    }
  });

  it("is off when the file is missing", () => {
    expect(loadGithubApps()).toEqual([]);
    expect(findGithubApp("acme", "x")).toBeUndefined();
  });

  it("parses apps, resolves relative key paths against the home, and caches", () => {
    write(valid);
    const apps = loadGithubApps();
    expect(apps).toEqual([
      {
        appId: 123,
        privateKeyFile: join(home, "key.pem"),
        repositories: ["acme/*", "other/widget"],
      },
    ]);
    rmSync(join(home, FILE));
    expect(loadGithubApps()).toBe(apps);
  });

  it("expands ~/ and keeps absolute key paths", () => {
    write(`apps:
  - app-id: 1
    private-key-file: ~/keys/a.pem
    repositories: [a/*]
  - app-id: 2
    private-key-file: /abs/b.pem
    repositories: [b/*]
`);
    expect(loadGithubApps().map((app) => app.privateKeyFile)).toEqual([
      join(homedir(), "keys/a.pem"),
      "/abs/b.pem",
    ]);
  });

  it("matches case-insensitively, by owner wildcard or exact repo, first app wins", () => {
    write(`apps:
  - app-id: 1
    private-key-file: a.pem
    repositories: [Acme/*]
  - app-id: 2
    private-key-file: b.pem
    repositories: [acme/special, Other/Widget]
`);
    expect(findGithubApp("ACME", "special")?.appId).toBe(1);
    expect(findGithubApp("other", "widget")?.appId).toBe(2);
    expect(findGithubApp("other", "gadget")).toBeUndefined();
    expect(findGithubApp("nobody", "x")).toBeUndefined();
  });

  it("rejects invalid files with a hard error naming the file", () => {
    expectConfigError("apps: [", "invalid YAML");
    expectConfigError("- a\n", "must be a mapping");
    expectConfigError("", "must be a mapping");
    expectConfigError("apps: []\n", "non-empty list");
    expectConfigError("apps: nope\n", "non-empty list");
    expectConfigError(`${valid}extra: 1\n`, 'unknown key "extra"');
    expectConfigError("apps:\n  - nope\n", "apps[0] must be a mapping");
    expectConfigError(
      "apps:\n  - app-id: 1\n    private-key-file: a\n    repositories: [a/*]\n    key: x\n",
      'unknown key "key" in apps[0]',
    );
  });

  it("rejects a bad app-id", () => {
    for (const id of ["0", "-1", "1.5", '"12"', "null"]) {
      expectConfigError(
        `apps:\n  - app-id: ${id}\n    private-key-file: a\n    repositories: [a/*]\n`,
        "app-id must be a positive integer",
      );
    }
  });

  it("rejects a bad key file and bad repositories", () => {
    expectConfigError(
      "apps:\n  - app-id: 1\n    repositories: [a/*]\n",
      "private-key-file must be a non-empty path",
    );
    expectConfigError(
      'apps:\n  - app-id: 1\n    private-key-file: ""\n    repositories: [a/*]\n',
      "private-key-file must be a non-empty path",
    );
    const base = "apps:\n  - app-id: 1\n    private-key-file: a\n";
    expectConfigError(`${base}    repositories: []\n`, "repositories must be a non-empty list");
    expectConfigError(`${base}`, "repositories must be a non-empty list");
    for (const pattern of ["a", "*/*", "a/b*", "a/b/c", "a/", "5"]) {
      expectConfigError(`${base}    repositories: ["${pattern}"]\n`, "repositories entry");
    }
  });

  it("reports an unreadable file as a hard error", () => {
    process.env["PR_SHEPHERD_HOME"] = join(home, "missing-dir-as-file");
    writeFileSync(join(home, "missing-dir-as-file"), "x");
    let error: unknown;
    try {
      loadGithubApps();
    } catch (caught) {
      error = caught;
    }
    expect((error as ShepherdError).message).toContain("cannot read");
    expect((error as ShepherdError).exitCode).toBe(EXIT.CONFIG);
  });
});
