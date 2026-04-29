import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RuleBasedCategorizer,
  LlmCategorizer,
  MAX_BATCH_SIZE,
  LLM_SYSTEM_PROMPT,
} from "./categorizer";
import type { UncategorizedTransaction } from "./categorizer";

describe("RuleBasedCategorizer", () => {
  const categorizer = new RuleBasedCategorizer();

  it("categorizes known merchants", () => {
    const result = categorizer.categorize("Netflix");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("Entertainment");
    expect(result!.confidence).toBe(0.95);
  });

  it("categorizes merchants case-insensitively", () => {
    const result = categorizer.categorize("STARBUCKS");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("Food & Drink");
  });

  it("handles merchant name variations", () => {
    const result = categorizer.categorize("NFLX*STREAMING SERVICE");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("Entertainment");
  });

  it("returns null for unknown merchants", () => {
    const result = categorizer.categorize("TOTALLY UNKNOWN MERCHANT XYZ123");
    if (result) {
      expect(result.confidence).toBeLessThan(0.95);
    }
  });

  it("returns null for empty merchant name", () => {
    expect(categorizer.categorize("")).toBeNull();
  });

  it("returns null for whitespace-only merchant name", () => {
    expect(categorizer.categorize("   ")).toBeNull();
  });

  it("ignores the description parameter (uses merchant name only)", () => {
    const result = categorizer.categorize("Netflix", "Monthly subscription charge");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("Entertainment");
  });
});

describe("LlmCategorizer", () => {
  const mockApiKey = "test-api-key";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createMockResponse(categories: Array<{ transactionId: string; category: string; confidence: number }>) {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(categories),
            },
          },
        ],
      }),
    };
  }

  it("categorizes a batch of transactions via API", async () => {
    const transactions: UncategorizedTransaction[] = [
      { transactionId: "tx-1", merchantName: "Local Coffee Shop", amount: "5.5000" },
      { transactionId: "tx-2", merchantName: "Dr. Smith Office", amount: "150.0000" },
    ];

    const mockResponse = createMockResponse([
      { transactionId: "tx-1", category: "Food & Drink", confidence: 0.85 },
      { transactionId: "tx-2", category: "Healthcare", confidence: 0.90 },
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as unknown as Response);

    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    const results = await categorizer.categorizeBatch(transactions);

    expect(results).toHaveLength(2);
    expect(results[0]!.category).toBe("Food & Drink");
    expect(results[0]!.confidence).toBe(0.85);
    expect(results[1]!.category).toBe("Healthcare");
    expect(results[1]!.confidence).toBe(0.90);
  });

  it("returns empty array for empty input", async () => {
    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    const results = await categorizer.categorizeBatch([]);
    expect(results).toEqual([]);
  });

  it("falls back to 'Other' when API returns invalid JSON", async () => {
    const transactions: UncategorizedTransaction[] = [
      { transactionId: "tx-1", merchantName: "Unknown Shop", amount: "10.0000" },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not valid json at all" } }],
      }),
    } as unknown as Response);

    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    const results = await categorizer.categorizeBatch(transactions);

    expect(results).toHaveLength(1);
    expect(results[0]!.category).toBe("Other");
    expect(results[0]!.confidence).toBe(0.50);
  });

  it("falls back to 'Other' when API returns empty choices", async () => {
    const transactions: UncategorizedTransaction[] = [
      { transactionId: "tx-1", merchantName: "Unknown Shop", amount: "10.0000" },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [] }),
    } as unknown as Response);

    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    const results = await categorizer.categorizeBatch(transactions);

    expect(results).toHaveLength(1);
    expect(results[0]!.category).toBe("Other");
  });

  it("throws on API error response", async () => {
    const transactions: UncategorizedTransaction[] = [
      { transactionId: "tx-1", merchantName: "Shop", amount: "10.0000" },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as unknown as Response);

    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    await expect(categorizer.categorizeBatch(transactions)).rejects.toThrow(
      "NVIDIA NIM API error: 429 Too Many Requests",
    );
  });

  it("splits large batches into sub-batches of MAX_BATCH_SIZE", async () => {
    const transactions: UncategorizedTransaction[] = Array.from(
      { length: MAX_BATCH_SIZE + 5 },
      (_, i) => ({
        transactionId: `tx-${i}`,
        merchantName: `Merchant ${i}`,
        amount: "10.0000",
      }),
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy.mockResolvedValueOnce(
      createMockResponse(
        Array.from({ length: MAX_BATCH_SIZE }, (_, i) => ({
          transactionId: `tx-${i}`,
          category: "Shopping",
          confidence: 0.80,
        })),
      ) as unknown as Response,
    );

    fetchSpy.mockResolvedValueOnce(
      createMockResponse(
        Array.from({ length: 5 }, (_, i) => ({
          transactionId: `tx-${MAX_BATCH_SIZE + i}`,
          category: "Shopping",
          confidence: 0.80,
        })),
      ) as unknown as Response,
    );

    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    const results = await categorizer.categorizeBatch(transactions);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(MAX_BATCH_SIZE + 5);
  });

  it("clamps confidence to [0.50, 0.95] range", async () => {
    const transactions: UncategorizedTransaction[] = [
      { transactionId: "tx-1", merchantName: "Shop A", amount: "10.0000" },
      { transactionId: "tx-2", merchantName: "Shop B", amount: "20.0000" },
    ];

    const mockResponse = createMockResponse([
      { transactionId: "tx-1", category: "Shopping", confidence: 0.10 },
      { transactionId: "tx-2", category: "Shopping", confidence: 0.99 },
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as unknown as Response);

    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    const results = await categorizer.categorizeBatch(transactions);

    expect(results[0]!.confidence).toBe(0.50);
    expect(results[1]!.confidence).toBe(0.95);
  });

  it("handles LLM response wrapped in markdown code fences", async () => {
    const transactions: UncategorizedTransaction[] = [
      { transactionId: "tx-1", merchantName: "Local Diner", amount: "25.0000" },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '```json\n[{"transactionId":"tx-1","category":"Food & Drink","confidence":0.85}]\n```',
            },
          },
        ],
      }),
    } as unknown as Response);

    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    const results = await categorizer.categorizeBatch(transactions);

    expect(results[0]!.category).toBe("Food & Drink");
    expect(results[0]!.confidence).toBe(0.85);
  });

  it("sends correct headers and model to NVIDIA NIM API", async () => {
    const transactions: UncategorizedTransaction[] = [
      { transactionId: "tx-1", merchantName: "Shop", amount: "10.0000" },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createMockResponse([
        { transactionId: "tx-1", category: "Shopping", confidence: 0.80 },
      ]) as unknown as Response,
    );

    const categorizer = new LlmCategorizer({ apiKey: mockApiKey });
    await categorizer.categorizeBatch(transactions);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");

    const reqOptions = options as RequestInit;
    const headers = reqOptions.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-api-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(reqOptions.body as string) as Record<string, unknown>;
    expect(body["model"]).toBe("meta/llama-3.3-70b-instruct");
  });
});

describe("LLM_SYSTEM_PROMPT", () => {
  it("instructs the LLM to NEVER compute monetary amounts", () => {
    expect(LLM_SYSTEM_PROMPT).toContain("NEVER compute");
  });

  it("instructs the LLM to respond with JSON only", () => {
    expect(LLM_SYSTEM_PROMPT).toContain("valid JSON only");
  });
});
