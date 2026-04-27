import { describe, it, expect, beforeEach } from "vitest";
import { SubscriptionStore } from "./subscriptions.mts";

let store: SubscriptionStore;

beforeEach(() => {
  store = new SubscriptionStore();
});

describe("subscribe / isSubscribed", () => {
  it("returns false for unsubscribed PR", () => {
    expect(store.isSubscribed(42)).toBe(false);
  });

  it("returns true after subscribe", () => {
    store.subscribe(42);
    expect(store.isSubscribed(42)).toBe(true);
  });

  it("does not affect other PRs", () => {
    store.subscribe(42);
    expect(store.isSubscribed(99)).toBe(false);
  });

  it("subscribe is idempotent", () => {
    store.subscribe(42);
    store.subscribe(42);
    expect(store.listSubscribed()).toEqual([42]);
  });
});

describe("unsubscribe", () => {
  it("removes a subscribed PR", () => {
    store.subscribe(42);
    store.unsubscribe(42);
    expect(store.isSubscribed(42)).toBe(false);
  });

  it("is a no-op for unsubscribed PR", () => {
    expect(() => store.unsubscribe(99)).not.toThrow();
  });
});

describe("listSubscribed", () => {
  it("returns empty array when no subscriptions", () => {
    expect(store.listSubscribed()).toEqual([]);
  });

  it("returns subscribed PRs sorted ascending", () => {
    store.subscribe(100);
    store.subscribe(5);
    store.subscribe(42);
    expect(store.listSubscribed()).toEqual([5, 42, 100]);
  });

  it("excludes unsubscribed PRs", () => {
    store.subscribe(1);
    store.subscribe(2);
    store.unsubscribe(1);
    expect(store.listSubscribed()).toEqual([2]);
  });
});
