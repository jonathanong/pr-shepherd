import { describe, expect, it } from "vitest";
import type { BatchPrData } from "../types.mts";
import { holdUnreadReadiness } from "./check-unread-readiness.mts";

const data = (unreadNodes?: BatchPrData["unreadNodes"]) =>
  ({ ...(unreadNodes && { unreadNodes }) }) as BatchPrData;

describe("holdUnreadReadiness", () => {
  it.each([{ checks: true as const }, { feedback: true as const }])(
    "holds READY to PENDING when %o was unreadable",
    (unread) => {
      expect(holdUnreadReadiness("READY", data(unread))).toBe("PENDING");
    },
  );

  it("leaves READY alone for a fully read snapshot", () => {
    expect(holdUnreadReadiness("READY", data())).toBe("READY");
  });

  it("never changes another status", () => {
    expect(holdUnreadReadiness("FAILING", data({ checks: true }))).toBe("FAILING");
  });
});
