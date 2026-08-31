import { describe, expect, it, vi } from "vitest";

import { EXIT, ShepherdError } from "../exit-codes.mts";
import { readSafeBodyFile } from "./safe-body-file.mts";

describe("readSafeBodyFile", () => {
  it("fails closed without opening when the platform cannot guarantee no-follow semantics", async () => {
    const open = vi.fn();

    await expect(
      readSafeBodyFile("body.md", {
        platform: "win32",
        noFollow: undefined,
        nonBlock: undefined,
        open,
      }),
    ).rejects.toMatchObject({ exitCode: EXIT.NOINPUT } satisfies Partial<ShepherdError>);

    expect(open).not.toHaveBeenCalled();
  });
});
