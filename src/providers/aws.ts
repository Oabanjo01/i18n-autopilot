/**
 * src/providers/aws.ts — AWS Translate adapter.
 * Uses @aws-sdk/client-translate to translate strings in parallel.
 */

import {
  TranslateClient,
  TranslateTextCommand,
} from "@aws-sdk/client-translate";
import { TranslationProvider, ProviderError } from "./types";

// ---------------------------------------------------------------------------
// Locale normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Convert a BCP-47 locale code to the format AWS Translate expects.
 *
 * Rules:
 *  - "zh-CN" / "zh-TW" / "zh" → keep as-is (AWS supports "zh", "zh-TW")
 *  - "fr-FR" / "fr"            → "fr"  (strip region suffix)
 *  - "pt-BR"                   → "pt"  (strip region suffix)
 *  - All others: primary language subtag only (lowercase)
 */
function toAWSLocale(locale: string): string {
  const lower = locale.toLowerCase();

  // Keep Chinese variants as-is — AWS supports "zh" and "zh-TW"
  if (lower.startsWith("zh")) return lower;

  // Strip region suffix for everything else
  return lower.split("-")[0];
}

// ---------------------------------------------------------------------------
// AWS provider
// ---------------------------------------------------------------------------

export class AWSProvider implements TranslationProvider {
  readonly name = "aws";
  private client: TranslateClient;

  constructor(
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly region: string,
  ) {
    this.client = new TranslateClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async translate(
    data: Record<string, string>,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<Record<string, string>> {
    if (Object.keys(data).length === 0) return {};

    const sourceLang = toAWSLocale(sourceLocale);
    const targetLang = toAWSLocale(targetLocale);

    const entries = Object.entries(data);

    const translated = await Promise.all(
      entries.map(async ([key, text]) => {
        try {
          const command = new TranslateTextCommand({
            Text: text,
            SourceLanguageCode: sourceLang,
            TargetLanguageCode: targetLang,
          });
          const response = await this.client.send(command);
          return [key, response.TranslatedText ?? text] as const;
        } catch (err: unknown) {
          const awsErr = err as { name?: string; message?: string };
          const code = awsErr.name ?? "UnknownError";
          const message = awsErr.message ?? String(err);
          throw new ProviderError("aws", `${code}: ${message}`);
        }
      }),
    );

    const result: Record<string, string> = {};
    for (const [key, value] of translated) {
      result[key] = value;
    }
    return result;
  }
}
