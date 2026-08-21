/** Allowed characters: alphanumeric, hyphen, underscore, dot. Prevents path traversal. */
export const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/** Positive decimal integer. Rejects traversal payloads that stringify as non-digits. */
export const SAFE_PR_NUMBER = /^[1-9][0-9]*$/;
