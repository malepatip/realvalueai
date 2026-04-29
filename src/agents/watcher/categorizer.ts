/**
 * Two-tier transaction categorization:
 * 1. RuleBasedCategorizer — fast, deterministic, uses MERCHANT_RULES + fuzzy matching
 * 2. LlmCategorizer — NVIDIA NIM API (Llama 3.3 70B) fallback for unmatched transactions
 *
 * The LLM is instructed to categorize ONLY — it NEVER computes monetary values.
 */

import { fuzzyMatchMerchant } from "./merchant-rules";
import type { MerchantMatchResult } from "./merchant-rules";

/** Input for LLM batch categorization */
export interface UncategorizedTransaction {
  readonly transactionId: string;
  readonly merchantName: string;
  readonly description?: string;
  readonly amount: string;
}

/** Output from LLM batch categorization */
export interface LlmCategoryResult {
  readonly transactionId: string;
  readonly category: string;
  readonly confidence: number;
}

/** Result from rule-based categorization (same shape as MerchantMatchResult) */
export type RuleCategoryResult = MerchantMatchResult;

/**
 * Rule-based categorizer using MERCHANT_RULES and fuzzy matching.
 * Deterministic, no network calls, sub-millisecond per transaction.
 */
export class RuleBasedCategorizer {
  categorize(
    merchantName: string,
    _description?: string,
  ): RuleCategoryResult | null {
    if (!merchantName || merchantName.trim() === "") {
      return null;
    }
    return fuzzyMatchMerchant(merchantName);
  }
}

/**
 * System prompt for the LLM categorizer.
 * Critical: instructs the model to NEVER compute numbers.
 */
const LLM_SYSTEM_PROMPT = `You are a financial transaction categorizer. Your ONLY job is to assign a category to each transaction based on the merchant name and description.

RULES:
1. You MUST respond with valid JSON only — no markdown, no explanation.
2. You MUST categorize each transaction into exactly one of these categories:
   Entertainment, Food & Drink, Transportation, Shopping, Software & Cloud,
   Fitness & Wellness, Utilities & Telecom, Insurance, Financial Services,
   Education, News & Media, Travel, Healthcare, Housing, Personal Care,
   Gifts & Donations, Government & Tax, Pets, Automotive, Other
3. You MUST assign a confidence score between 0.50 and 0.95.
4. You MUST NEVER compute, add, subtract, multiply, or compare any monetary amounts.
   Amounts are provided for context only — do NOT reference them in your output.
5. Respond with a JSON array of objects: [{"transactionId":"...","category":"...","confidence":0.XX}]`;

/** Maximum transactions per LLM API call */
const MAX_BATCH_SIZE = 20;

/** Configuration for the NVIDIA NIM API client */
export interface NimApiConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

/**
 * LLM-based categorizer using NVIDIA NIM API (Llama 3.3 70B).
 * Used as a fallback for transactions that don't match any merchant rules.
 */
export class LlmCategorizer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: NimApiConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://integrate.api.nvidia.com/v1";
    this.model = config.model ?? "meta/llama-3.3-70b-instruct";
  }

  /**
   * Categorize a batch of transactions via the NVIDIA NIM API.
   * Automatically splits into sub-batches of MAX_BATCH_SIZE.
   */
  async categorizeBatch(
    transactions: readonly UncategorizedTransaction[],
  ): Promise<LlmCategoryResult[]> {
    if (transactions.length === 0) {
      return [];
    }

    const results: LlmCategoryResult[] = [];

    for (let i = 0; i < transactions.length; i += MAX_BATCH_SIZE) {
      const batch = transactions.slice(i, i + MAX_BATCH_SIZE);
      const batchResults = await this.categorizeSingleBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async categorizeSingleBatch(
    batch: readonly UncategorizedTransaction[],
  ): Promise<LlmCategoryResult[]> {
    const userPrompt = this.buildUserPrompt(batch);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: LLM_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `NVIDIA NIM API error: ${response.status} ${response.statusText}`,
      );
    }

    const data: unknown = await response.json();
    return this.parseResponse(data, batch);
  }

  private buildUserPrompt(
    batch: readonly UncategorizedTransaction[],
  ): string {
    const items = batch.map((tx) => ({
      transactionId: tx.transactionId,
      merchantName: tx.merchantName,
      description: tx.description ?? "",
    }));

    return `Categorize these ${batch.length} transactions:\n${JSON.stringify(items, null, 2)}`;
  }

  /**
   * Parse the LLM response into structured category results.
   * Falls back to "Other" with low confidence for any transaction
   * missing from the response.
   */
  private parseResponse(
    data: unknown,
    batch: readonly UncategorizedTransaction[],
  ): LlmCategoryResult[] {
    const content = extractContent(data);
    if (!content) {
      return batch.map((tx) => ({
        transactionId: tx.transactionId,
        category: "Other",
        confidence: 0.50,
      }));
    }

    let parsed: unknown;
    try {
      const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return batch.map((tx) => ({
        transactionId: tx.transactionId,
        category: "Other",
        confidence: 0.50,
      }));
    }

    if (!Array.isArray(parsed)) {
      return batch.map((tx) => ({
        transactionId: tx.transactionId,
        category: "Other",
        confidence: 0.50,
      }));
    }

    const resultMap = new Map<string, LlmCategoryResult>();
    for (const item of parsed) {
      if (isLlmResultItem(item)) {
        resultMap.set(item.transactionId, {
          transactionId: item.transactionId,
          category: item.category,
          confidence: clampConfidence(item.confidence),
        });
      }
    }

    return batch.map((tx) => {
      const found = resultMap.get(tx.transactionId);
      return found ?? {
        transactionId: tx.transactionId,
        category: "Other",
        confidence: 0.50,
      };
    });
  }
}

/** Type guard for LLM response items */
function isLlmResultItem(
  item: unknown,
): item is { transactionId: string; category: string; confidence: number } {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj["transactionId"] === "string" &&
    typeof obj["category"] === "string" &&
    typeof obj["confidence"] === "number"
  );
}

/** Extract the text content from a chat completion response */
function extractContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  const choices = obj["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  const message = first["message"] as Record<string, unknown> | undefined;
  if (!message) return null;
  const content = message["content"];
  return typeof content === "string" ? content : null;
}

/** Clamp confidence to [0.50, 0.95] range */
function clampConfidence(value: number): number {
  return Math.min(0.95, Math.max(0.50, value));
}

export { MAX_BATCH_SIZE, LLM_SYSTEM_PROMPT };
