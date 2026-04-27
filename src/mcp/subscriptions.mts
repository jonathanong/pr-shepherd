/** Per-session PR subscription state for webhook event forwarding. */

export class SubscriptionStore {
  private readonly subs = new Set<number>();

  subscribe(prNumber: number): void {
    this.subs.add(prNumber);
  }

  unsubscribe(prNumber: number): void {
    this.subs.delete(prNumber);
  }

  isSubscribed(prNumber: number): boolean {
    return this.subs.has(prNumber);
  }

  listSubscribed(): number[] {
    return [...this.subs].sort((a, b) => a - b);
  }
}
