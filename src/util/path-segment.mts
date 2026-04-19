/** Allowed characters: alphanumeric, hyphen, underscore, dot. Prevents path traversal. */
export const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;
