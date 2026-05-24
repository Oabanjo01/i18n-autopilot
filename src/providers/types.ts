/**
 * Every translation adapter must implement this interface.
 * The translate method receives only the keys that are missing from the
 * target locale file — callers are responsible for diffing.
 */
export interface TranslationProvider {
  /** Human-readable identifier, e.g. "lingo", "deepl". Must be unique in the registry. */
  readonly name: string;

  /**
   * Translate a map of English strings into the target locale.
   *
   * @param data         Key→value map of strings to translate (may be empty).
   * @param sourceLocale Always "en" in the current pipeline.
   * @param targetLocale BCP-47 locale code, e.g. "es", "fr-FR".
   * @returns            A Record with the same keys as `data` and translated values.
   *                     Returns {} immediately when `data` is empty (no API call).
   */
  translate(
    data: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>>;
}

/** Thrown by any adapter when its underlying API call fails. */
export class ProviderError extends Error {
  constructor(
    public readonly providerName: string,
    cause: Error | string,
  ) {
    const reason = cause instanceof Error ? cause.message : cause;
    super(`[${providerName}] ${reason}`);
    this.name = "ProviderError";
  }
}
