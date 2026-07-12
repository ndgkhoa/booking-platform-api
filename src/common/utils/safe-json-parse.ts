/** Parses JSON, returning null instead of throwing on malformed input. Used on
 * signature-verified webhook bodies so a malformed payload yields a clean 4xx
 * rather than an unhandled throw that a provider would retry against. */
export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
