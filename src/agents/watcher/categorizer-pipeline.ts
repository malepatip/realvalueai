/**
 * Two-pass categorization pipeline:
 *   Pass 1: RuleBasedCategorizer (deterministic, fast)
 *   Pass 2: LlmCategorizer (NVIDIA NIM fallback for unmatched)
 *
 * All monetary values use the Money class — never IEEE 754 floats.
 */

import type { Transaction } from "@/types/database";
import type { CategorizedTransaction } from "@/types/watcher";
import { RuleBasedCategorizer, LlmCategorizer } from "./categorizer";
import type { UncategorizedTransaction, NimApiConfig } from "./categorizer";

/** A raw transaction input — matches the database Transaction shape */
export type RawTransaction = Pick<
  Transaction,
  "id" | "amount" | "merchant_name" | "description" | "transaction_date"
>;

/**
 * Run the two-pass categorization pipeline on a batch of raw transactions.
 *
 * Pass 1: Rule-based matching (MERCHANT_RULES + fuzzy)
 * Pass 2: LLM fallback for any transactions not matched in Pass 1
 *
 * Returns CategorizedTransaction[] with all transactions categorized.
 */
export async function categorizeBatch(
  transactions: readonly RawTransaction[],
  nimConfig: NimApiConfig,
): Promise<CategorizedTransaction[]> {
  if (transactions.length === 0) {
    return [];
  }

  const ruleCategorizer = new RuleBasedCategorizer();
  const results: CategorizedTransaction[] = [];
  const unmatched: UncategorizedTransaction[] = [];
  const unmatchedIndices: number[] = [];

  // Pass 1: Rule-based categorization
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]!;
    const merchantName = tx.merchant_name ?? "";

    if (merchantName.trim() === "") {
      // No merchant name — goes straight to LLM
      unmatched.push({
        transactionId: tx.id,
        merchantName: tx.description ?? "Unknown",
        description: tx.description ?? undefined,
        amount: tx.amount,
      });
      unmatchedIndices.push(i);
      results.push(null as unknown as CategorizedTransaction); // placeholder
      continue;
    }

    const ruleResult = ruleCategorizer.categorize(merchantName, tx.description ?? undefined);

    if (ruleResult) {
      results.push({
        transactionId: tx.id,
        merchantName,
        merchantCategory: ruleResult.category,
        categoryRuleMatched: ruleResult.ruleMatched,
        categoryConfidence: ruleResult.confidence,
        amount: tx.amount,
        transactionDate: tx.transaction_date,
      });
    } else {
      unmatched.push({
        transactionId: tx.id,
        merchantName,
        description: tx.description ?? undefined,
        amount: tx.amount,
      });
      unmatchedIndices.push(i);
      results.push(null as unknown as CategorizedTransaction); // placeholder
    }
  }

  // Pass 2: LLM fallback for unmatched transactions
  if (unmatched.length > 0) {
    const llmCategorizer = new LlmCategorizer(nimConfig);
    const llmResults = await llmCategorizer.categorizeBatch(unmatched);

    // Map LLM results back by transactionId
    const llmMap = new Map(llmResults.map((r) => [r.transactionId, r]));

    for (let j = 0; j < unmatchedIndices.length; j++) {
      const idx = unmatchedIndices[j]!;
      const tx = transactions[idx]!;
      const unmatchedTx = unmatched[j]!;
      const llmResult = llmMap.get(unmatchedTx.transactionId);

      results[idx] = {
        transactionId: tx.id,
        merchantName: tx.merchant_name ?? tx.description ?? "Unknown",
        merchantCategory: llmResult?.category ?? "Other",
        categoryRuleMatched: "llm",
        categoryConfidence: llmResult?.confidence ?? 0.50,
        amount: tx.amount,
        transactionDate: tx.transaction_date,
      };
    }
  }

  return results;
}
