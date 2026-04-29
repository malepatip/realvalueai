/**
 * Merchant name → category mapping rules and fuzzy matching engine.
 *
 * The MERCHANT_RULES map uses lowercase regex patterns as keys.
 * fuzzyMatchMerchant normalizes the input, then tries exact regex match,
 * then Levenshtein-based fuzzy match.
 */

export interface MerchantMatchResult {
  readonly category: string;
  readonly confidence: number;
  readonly ruleMatched: string;
}

/**
 * Merchant rules: pattern (lowercase) → category.
 * Patterns are tested as regex against the normalized merchant name.
 */
export const MERCHANT_RULES: ReadonlyMap<string, string> = new Map([
  // Entertainment / Streaming
  ["netflix", "Entertainment"],
  ["nflx", "Entertainment"],
  ["hulu", "Entertainment"],
  ["disney\\+|disneyplus", "Entertainment"],
  ["hbo\\s*max|hbomax", "Entertainment"],
  ["spotify", "Entertainment"],
  ["apple\\s*music", "Entertainment"],
  ["youtube\\s*(premium|music)?", "Entertainment"],
  ["amazon\\s*prime\\s*video", "Entertainment"],
  ["paramount\\+|paramountplus", "Entertainment"],
  ["peacock", "Entertainment"],
  ["crunchyroll", "Entertainment"],
  ["audible", "Entertainment"],
  ["tidal", "Entertainment"],
  ["pandora", "Entertainment"],
  ["siriusxm|sirius\\s*xm", "Entertainment"],
  ["twitch", "Entertainment"],

  // Food & Drink
  ["starbucks", "Food & Drink"],
  ["mcdonald", "Food & Drink"],
  ["chipotle", "Food & Drink"],
  ["chick-?fil-?a", "Food & Drink"],
  ["dunkin", "Food & Drink"],
  ["subway", "Food & Drink"],
  ["taco\\s*bell", "Food & Drink"],
  ["wendy", "Food & Drink"],
  ["burger\\s*king", "Food & Drink"],
  ["domino", "Food & Drink"],
  ["pizza\\s*hut", "Food & Drink"],
  ["papa\\s*john", "Food & Drink"],
  ["panera", "Food & Drink"],
  ["grubhub", "Food & Drink"],
  ["doordash", "Food & Drink"],
  ["uber\\s*eats", "Food & Drink"],
  ["instacart", "Food & Drink"],
  ["postmates", "Food & Drink"],

  // Transportation
  ["uber(?!\\s*eats)", "Transportation"],
  ["lyft", "Transportation"],
  ["lime\\s*scooter|lime\\s*bike", "Transportation"],

  // Shopping
  ["amazon(?!\\s*prime\\s*video)", "Shopping"],
  ["amzn", "Shopping"],
  ["walmart", "Shopping"],
  ["target", "Shopping"],
  ["costco", "Shopping"],
  ["ebay", "Shopping"],
  ["etsy", "Shopping"],
  ["best\\s*buy", "Shopping"],
  ["home\\s*depot", "Shopping"],
  ["lowe", "Shopping"],
  ["ikea", "Shopping"],
  ["wayfair", "Shopping"],
  ["shein", "Shopping"],
  ["wish\\.com|wish\\s", "Shopping"],

  // Software / Cloud / Tech
  ["microsoft|msft", "Software & Cloud"],
  ["google\\s*(cloud|workspace|one|storage)", "Software & Cloud"],
  ["apple\\.com|itunes", "Software & Cloud"],
  ["adobe", "Software & Cloud"],
  ["dropbox", "Software & Cloud"],
  ["slack", "Software & Cloud"],
  ["zoom\\s*(video)?", "Software & Cloud"],
  ["github", "Software & Cloud"],
  ["notion", "Software & Cloud"],
  ["openai|chatgpt", "Software & Cloud"],
  ["aws|amazon\\s*web\\s*services", "Software & Cloud"],
  ["heroku", "Software & Cloud"],
  ["vercel", "Software & Cloud"],

  // Fitness & Wellness
  ["planet\\s*fitness", "Fitness & Wellness"],
  ["peloton", "Fitness & Wellness"],
  ["orangetheory|orange\\s*theory", "Fitness & Wellness"],
  ["equinox", "Fitness & Wellness"],
  ["anytime\\s*fitness", "Fitness & Wellness"],
  ["headspace", "Fitness & Wellness"],
  ["calm\\.com|calm\\s*app", "Fitness & Wellness"],
  ["noom", "Fitness & Wellness"],

  // Utilities & Telecom
  ["at&t|att\\s", "Utilities & Telecom"],
  ["verizon", "Utilities & Telecom"],
  ["t-?mobile|tmobile", "Utilities & Telecom"],
  ["comcast|xfinity", "Utilities & Telecom"],
  ["spectrum", "Utilities & Telecom"],
  ["cox\\s*comm", "Utilities & Telecom"],

  // Insurance
  ["geico", "Insurance"],
  ["progressive\\s*ins", "Insurance"],
  ["state\\s*farm", "Insurance"],
  ["allstate", "Insurance"],

  // Financial Services
  ["venmo", "Financial Services"],
  ["paypal", "Financial Services"],
  ["cash\\s*app|square\\s*cash", "Financial Services"],
  ["zelle", "Financial Services"],
  ["robinhood", "Financial Services"],
  ["coinbase", "Financial Services"],

  // Education
  ["coursera", "Education"],
  ["udemy", "Education"],
  ["skillshare", "Education"],
  ["masterclass", "Education"],
  ["duolingo", "Education"],

  // News & Media
  ["new\\s*york\\s*times|nytimes", "News & Media"],
  ["wall\\s*street\\s*journal|wsj", "News & Media"],
  ["washington\\s*post", "News & Media"],
  ["medium\\.com", "News & Media"],
  ["substack", "News & Media"],

  // Travel
  ["airbnb", "Travel"],
  ["booking\\.com", "Travel"],
  ["expedia", "Travel"],
  ["united\\s*air", "Travel"],
  ["delta\\s*air", "Travel"],
  ["southwest\\s*air", "Travel"],
  ["american\\s*air", "Travel"],
]);

/**
 * Normalize a merchant name for matching:
 * - Lowercase
 * - Strip common suffixes (Inc, LLC, Corp, Ltd, .com, etc.)
 * - Collapse whitespace
 * - Trim
 */
function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[*#]+/g, " ")
    .replace(/\b(inc\.?|llc\.?|corp\.?|ltd\.?|co\.?|l\.?p\.?)\b/gi, "")
    .replace(/\.com\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute Levenshtein distance between two strings.
 * Used for fuzzy matching when exact/regex matching fails.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  const prev: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  const curr: number[] = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j] ?? 0;
    }
  }

  return prev[n] ?? m;
}

/**
 * Extract the core merchant keyword from a rule pattern.
 * Strips regex metacharacters to get a plain-text representation.
 */
function extractCoreKeyword(pattern: string): string {
  return pattern
    .replace(/\\.|\[.*?\]|\(.*?\)|\?|\\s\*|\+|\*|\|.*$/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Attempt to match a merchant name against the MERCHANT_RULES map.
 *
 * Strategy (in order):
 * 1. Exact regex match against all patterns → confidence 0.95
 * 2. Levenshtein fuzzy match against core keywords → confidence scaled by similarity
 *
 * Returns null if no match found above the minimum confidence threshold (0.60).
 */
export function fuzzyMatchMerchant(merchantName: string): MerchantMatchResult | null {
  if (!merchantName || merchantName.trim() === "") {
    return null;
  }

  const normalized = normalizeMerchantName(merchantName);
  if (normalized === "") {
    return null;
  }

  // Pass 1: Regex match against all patterns
  for (const [pattern, category] of MERCHANT_RULES) {
    try {
      const regex = new RegExp(pattern, "i");
      if (regex.test(normalized)) {
        return {
          category,
          confidence: 0.95,
          ruleMatched: pattern,
        };
      }
    } catch {
      // Skip invalid regex patterns
      continue;
    }
  }

  // Pass 2: Levenshtein fuzzy match against core keywords
  const MIN_CONFIDENCE = 0.60;
  let bestMatch: MerchantMatchResult | null = null;
  let bestSimilarity = 0;

  for (const [pattern, category] of MERCHANT_RULES) {
    const keyword = extractCoreKeyword(pattern);
    if (keyword.length < 3) continue;

    const searchIn = normalized.replace(/\s/g, "");

    for (let start = 0; start <= searchIn.length - Math.max(keyword.length - 2, 1); start++) {
      const end = Math.min(start + keyword.length + 2, searchIn.length);
      const substring = searchIn.slice(start, end);
      const distance = levenshteinDistance(keyword, substring);
      const maxLen = Math.max(keyword.length, substring.length);
      const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;

      if (similarity > bestSimilarity && similarity >= MIN_CONFIDENCE) {
        bestSimilarity = similarity;
        bestMatch = {
          category,
          confidence: parseFloat((similarity * 0.90).toFixed(4)),
          ruleMatched: pattern,
        };
      }
    }
  }

  return bestMatch;
}
