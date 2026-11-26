import { isReadOnly } from "../execution-context.mts";
import { isGraphQlMutationDocument } from "./graphql-internal-retry.mts";

/**
 * Raised when a read-only scope (the library `status` method) reaches a GitHub mutation. A normal
 * status tick never gets here: the call sites that mutate are skipped first, so this is only the
 * backstop that keeps a missed site from changing GitHub.
 */
class ReadOnlyViolationError extends Error {
  constructor(operation: string) {
    super(`read-only status check refused a GitHub mutation: ${operation}`);
    this.name = "ReadOnlyViolationError";
  }
}

/** Refuse a GraphQL document whose root operation is a mutation. */
export function assertGraphQlReadable(document: string): void {
  if (isReadOnly() && isGraphQlMutationDocument(document)) {
    throw new ReadOnlyViolationError("GraphQL mutation");
  }
}

/** Refuse any REST method other than GET or HEAD. */
export function assertRestReadable(method: string, path: string): void {
  if (isReadOnly() && method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD") {
    throw new ReadOnlyViolationError(`REST ${method.toUpperCase()} ${path}`);
  }
}
