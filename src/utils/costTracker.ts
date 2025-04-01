import { logger } from './logger.js';
import { RequestContext } from './requestContext.js';

// --- Pricing Data Structures ---

// Rates are typically per million tokens or per 1000 requests/searches
const PER_MILLION = 1_000_000;
const PER_THOUSAND = 1_000;

interface TokenPricing {
    input: number; // Cost per million input tokens
    output: number; // Cost per million output tokens
    reasoning?: number; // Cost per million reasoning tokens (optional)
}

interface RequestPricing {
    requestFee?: number; // Cost per 1000 requests (optional)
    searchFee?: number; // Cost per 1000 searches (optional, legacy)
}

interface ModelPricing extends TokenPricing, RequestPricing {}

// --- Legacy Pricing (Deprecated 04/18/2025) ---
// Note: Accurate calculation is difficult due to reliance on search count and citation tokens.
const legacyPricing: Record<string, ModelPricing> = {
    'sonar-deep-research': { input: 2, output: 8, reasoning: 3, requestFee: 5, searchFee: 5 }, // Complex search fee logic applies
    'sonar-reasoning-pro': { input: 2, output: 8, requestFee: 5, searchFee: 5 }, // Complex search fee logic applies
    'sonar-reasoning': { input: 1, output: 5, requestFee: 5, searchFee: 5 }, // Assumes 1 search per request
    'sonar-pro': { input: 3, output: 15, requestFee: 5, searchFee: 5 }, // Complex search fee logic applies
    'sonar': { input: 1, output: 1, requestFee: 5, searchFee: 5 }, // Assumes 1 search per request
    'r1-1776': { input: 2, output: 8 }, // No request/search fee listed
};

// --- New Pricing (Search Modes) ---
type SearchMode = 'high' | 'medium' | 'low';

interface NewModelPricing {
    tokenPricing: TokenPricing;
    requestFees: Partial<Record<SearchMode, number>>; // Cost per 1000 requests by mode
}

const newPricing: Record<string, NewModelPricing> = {
    'sonar-pro': {
        tokenPricing: { input: 3, output: 15 },
        requestFees: { high: 14, medium: 10, low: 6 },
    },
    'sonar': {
        tokenPricing: { input: 1, output: 1 },
        requestFees: { high: 12, medium: 8, low: 5 },
    },
    'sonar-reasoning-pro': {
        tokenPricing: { input: 2, output: 8 },
        requestFees: { high: 14, medium: 10, low: 6 },
    },
    'sonar-reasoning': {
        tokenPricing: { input: 1, output: 5 },
        requestFees: { high: 12, medium: 8, low: 5 },
    },
    // Deep Research and r1-1776 don't have search modes listed in the provided text
    'sonar-deep-research': {
        tokenPricing: { input: 2, output: 8, reasoning: 3 },
        requestFees: { high: 5, medium: 5, low: 5 } // Assuming legacy request fee applies regardless of mode? Needs clarification.
    },
    'r1-1776': {
        tokenPricing: { input: 2, output: 8 },
        requestFees: {} // No request fee listed
    },
};

// --- Usage Data Interface ---
interface UsageData {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number; // Often provided, but we calculate from prompt/completion
    // Reasoning tokens are not standard in the API response, needed for deep-research legacy
}

// --- Cost Calculation Logic ---

/**
 * Calculates the estimated cost of a Perplexity API call.
 * Prioritizes the new pricing model if applicable, falls back to legacy otherwise.
 *
 * @param model - The name of the Perplexity model used.
 * @param usage - The token usage data from the API response.
 * @param searchMode - The search mode used (optional, for new pricing).
 * @param context - The request context for logging.
 * @returns The estimated cost in USD, or null if pricing info is unavailable.
 */
export function calculatePerplexityCost(
    model: string,
    usage: UsageData,
    searchMode: SearchMode | undefined | null, // Allow undefined/null
    context: RequestContext
): number | null {
    const operation = 'calculatePerplexityCost';
    let cost = 0;
    let pricingSource = 'unknown';

    // --- Try New Pricing First ---
    if (newPricing[model] && searchMode) {
        const pricing = newPricing[model];
        pricingSource = `new (${searchMode} mode)`;

        const inputCost = (usage.prompt_tokens / PER_MILLION) * pricing.tokenPricing.input;
        const outputCost = (usage.completion_tokens / PER_MILLION) * pricing.tokenPricing.output;
        const requestFee = (pricing.requestFees[searchMode] ?? 0) / PER_THOUSAND; // Fee per single request

        cost = inputCost + outputCost + requestFee;

        // Add reasoning cost if applicable (only deep-research has it in new structure)
        if (pricing.tokenPricing.reasoning) {
            // PROBLEM: Reasoning tokens aren't in standard usage data.
            // We cannot accurately calculate this part for deep-research new pricing without more info.
            logger.warn("Cannot calculate reasoning token cost for deep-research (new pricing) - reasoning token count not available in standard usage data.", { ...context, operation, model });
        }

    }
    // --- Fallback to Legacy Pricing (with caveats) ---
    else if (legacyPricing[model]) {
        const pricing = legacyPricing[model];
        pricingSource = 'legacy (deprecated 04/18/2025)';

        const inputCost = (usage.prompt_tokens / PER_MILLION) * pricing.input;
        const outputCost = (usage.completion_tokens / PER_MILLION) * pricing.output;
        const requestFee = (pricing.requestFee ?? 0) / PER_THOUSAND; // Base request fee

        cost = inputCost + outputCost + requestFee;

        // Add reasoning cost if applicable (only deep-research)
        if (pricing.reasoning) {
            // PROBLEM: Reasoning tokens aren't in standard usage data.
             logger.warn("Cannot calculate reasoning token cost for deep-research (legacy pricing) - reasoning token count not available in standard usage data.", { ...context, operation, model });
        }

        // PROBLEM: Cannot accurately calculate legacy search fees without search count.
        if (pricing.searchFee) {
             logger.warn(`Cannot accurately calculate legacy search fee for ${model} - search count not available. Base request fee applied.`, { ...context, operation, model });
        }

    } else {
        logger.error(`Pricing information not found for model: ${model}`, { ...context, operation, model });
        return null; // Indicate cost couldn't be calculated
    }

    logger.debug(`Calculated cost for model ${model} (${pricingSource})`, {
        ...context,
        operation,
        model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        estimatedCost: cost,
        pricingSource,
    });

    // Return cost rounded to a reasonable number of decimal places (e.g., 6)
    return parseFloat(cost.toFixed(6));
}

// --- Cost Tracking Service (Optional - could be expanded later) ---
// For now, we just export the calculation function.
// A service could maintain aggregate costs, etc.

export const costTracker = {
    calculatePerplexityCost,
    // Future methods for aggregation, reporting, etc.
};
