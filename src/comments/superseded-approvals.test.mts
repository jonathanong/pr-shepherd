import { describe, it, expect } from "vitest";
import { findSupersededApprovalIds } from "./superseded-approvals.mts";

describe("findSupersededApprovalIds", () => {
  it("marks earlier approvals from the same reviewer as superseded and keeps only the latest", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [
        { id: "PRR_AP_1", author: "coderabbitai", state: "APPROVED", createdAtUnix: 100 },
        { id: "PRR_AP_2", author: "coderabbitai", state: "APPROVED", createdAtUnix: 200 },
      ],
    });
    expect([...superseded]).toEqual(["PRR_AP_1"]);
  });

  it("uses chronological array order to break equal-timestamp ties between approvals", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [
        { id: "PRR_AP_1", author: "coderabbitai", state: "APPROVED", createdAtUnix: 0 },
        { id: "PRR_AP_2", author: "coderabbitai", state: "APPROVED", createdAtUnix: 0 },
      ],
    });
    expect([...superseded]).toEqual(["PRR_AP_1"]);
  });

  it("marks previous approvals superseded when the same reviewer adds a CHANGES_REQUESTED review", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [
        { id: "PRR_AP_1", author: "coderabbitai", state: "APPROVED", createdAtUnix: 100 },
        { id: "PRR_CR_1", author: "coderabbitai", state: "CHANGES_REQUESTED", createdAtUnix: 200 },
      ],
    });
    expect([...superseded]).toEqual(["PRR_AP_1"]);
  });

  it("marks previous approvals superseded when the same reviewer's later review is DISMISSED", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [
        { id: "PRR_AP_1", author: "coderabbitai", state: "APPROVED", createdAtUnix: 100 },
        { id: "PRR_DIS_1", author: "coderabbitai", state: "DISMISSED", createdAtUnix: 200 },
      ],
    });
    expect([...superseded]).toEqual(["PRR_AP_1"]);
  });

  it("marks previous approvals superseded when the same reviewer adds a non-empty COMMENTED review", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [
        { id: "PRR_AP_1", author: "coderabbitai", state: "APPROVED", createdAtUnix: 100 },
        {
          id: "PRR_CM_1",
          author: "coderabbitai",
          state: "COMMENTED",
          body: "New review summary",
          createdAtUnix: 200,
        },
      ],
    });
    expect([...superseded]).toEqual(["PRR_AP_1"]);
  });

  it("does not treat empty-body COMMENTED reviews (inline thread replies) as superseding approvals", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [
        { id: "PRR_AP_1", author: "coderabbitai", state: "APPROVED", createdAtUnix: 100 },
        {
          id: "PRR_REPLY_1",
          author: "coderabbitai",
          state: "COMMENTED",
          body: "   ",
          createdAtUnix: 200,
        },
      ],
    });
    expect([...superseded]).toEqual([]);
  });

  it("keeps approvals from different reviewers independent", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [
        { id: "PRR_AP_A", author: "coderabbitai", state: "APPROVED", createdAtUnix: 100 },
        {
          id: "PRR_CR_B",
          author: "jongs-reviewer-bot",
          state: "CHANGES_REQUESTED",
          createdAtUnix: 200,
        },
      ],
    });
    expect([...superseded]).toEqual([]);
  });

  it("keeps the newest approval after an earlier CHANGES_REQUESTED review", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [
        { id: "PRR_AP_1", author: "coderabbitai", state: "APPROVED", createdAtUnix: 100 },
        { id: "PRR_CR_1", author: "coderabbitai", state: "CHANGES_REQUESTED", createdAtUnix: 200 },
        { id: "PRR_AP_2", author: "coderabbitai", state: "APPROVED", createdAtUnix: 300 },
      ],
      latestReviews: [{ login: "coderabbitai", state: "APPROVED" }],
    });
    expect([...superseded]).toEqual(["PRR_AP_1"]);
  });

  it("treats latestReviews CHANGES_REQUESTED/DISMISSED as superseding even when timestamps are absent", () => {
    const superseded = findSupersededApprovalIds({
      reviews: [{ id: "PRR_AP_1", author: "CodeRabbitAI", state: "APPROVED", createdAtUnix: 0 }],
      latestReviews: [{ login: "coderabbitai", state: "CHANGES_REQUESTED" }],
    });
    expect([...superseded]).toEqual(["PRR_AP_1"]);
  });
});
