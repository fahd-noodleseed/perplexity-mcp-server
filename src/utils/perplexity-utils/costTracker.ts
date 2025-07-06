import { logger, RequestContext } from '../index.js';

// --- Pricing Data Structures ---

// Rates are typically per million tokens or per 1000 requests/searches
const PER_MILLION = 1_000_000;
const PER_THOUSAND = 1_000;

/**
 * Represents the cost components for token usage.
 * All costs are per million tokens.
 */
interface TokenPricing {
    input: number;
    output: number;
    reasoning?: number; // For models with specific reasoning token costs
    citation?: number;  // For models with specific citation token costs
}

/**
 * Represents the cost components for API actions.
 */
interface ActionPricing {
    requestFee?: number; // Cost per 1000 requests
    searchQueryFee?: number; // Cost per 1000 search queries
}

/**
 * Defines the pricing tiers for models where cost varies by effort/context.
 * 'low', 'medium', 'high' correspond to the tiers in the documentation.
 */
type ApiTier = 'high' | 'medium' | 'low';

/**
 * A comprehensive pricing structure for a single model.
 */
interface ModelPricing {
    tokenPricing: TokenPricing;
    // Fees per 1000 actions, which can vary by tier.
    actionPricing: ActionPricing & {
        requestFeesByTier?: Partial<Record<ApiTier, number>>;
    };
}

// --- Current Perplexity Model Pricing ---
// Based on documentation from 2025-07-05
const modelPricingSheet: Record<string, ModelPricing> = {
    'sonar': {
        tokenPricing: { input: 1.00, output: 1.00 },
        actionPricing: {
            requestFeesByTier: { low: 5, medium: 8, high: 12 }
        }
    },
    'sonar-pro': {
        tokenPricing: { input: 3.00, output: 15.00 },
        actionPricing: {
            requestFeesByTier: { low: 6, medium: 10, high: 14 }
        }
    },
    'sonar-reasoning': {
        tokenPricing: { input: 1.00, output: 5.00 },
        actionPricing: {
            requestFeesByTier: { low: 5, medium: 8, high: 12 }
        }
    },
    'sonar-reasoning-pro': {
        tokenPricing: { input: 2.00, output: 8.00 },
        actionPricing: {
            requestFeesByTier: { low: 6, medium: 10, high: 14 }
        }
    },
    'sonar-deep-research': {
        tokenPricing: {
            input: 2.00,
            output: 8.00,
            citation: 2.00,
            reasoning: 3.00,
        },
        actionPricing: {
            searchQueryFee: 5.00
        }
    }
};


// --- Usage Data Interface ---
/**
 * Represents the usage data returned from the Perplexity API.
 * This is extended to include potential new token types.
 */
interface UsageData {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    // Optional fields for advanced models like sonar-deep-research
    reasoning_tokens?: number;
    citation_tokens?: number;
    search_queries?: number; // Number of search queries performed
}

// --- Cost Calculation Logic ---

/**
 * Calculates the estimated cost of a Perplexity API call.
 *
 * @param model - The name of the Perplexity model used.
 * @param usage - The token and action usage data from the API response.
 * @param apiTier - The API tier used ('low', 'medium', 'high'), which may affect request fees.
 * @param context - The request context for logging.
 * @returns The estimated cost in USD, or null if pricing info is unavailable.
 */
export function calculatePerplexityCost(
    model: string,
    usage: UsageData,
    apiTier: ApiTier | undefined | null,
    context: RequestContext
): number | null {
    const operation = 'calculatePerplexityCost';
    const pricing = modelPricingSheet[model];

    if (!pricing) {
        logger.error(`Pricing information not found for model: ${model}`, { ...context, operation, model });
        return null;
    }

    let cost = 0;

    // 1. Calculate Token Costs
    const { tokenPricing } = pricing;
    cost += (usage.prompt_tokens / PER_MILLION) * tokenPricing.input;
    cost += (usage.completion_tokens / PER_MILLION) * tokenPricing.output;

    if (tokenPricing.reasoning && usage.reasoning_tokens) {
        cost += (usage.reasoning_tokens / PER_MILLION) * tokenPricing.reasoning;
    }
    if (tokenPricing.citation && usage.citation_tokens) {
        cost += (usage.citation_tokens / PER_MILLION) * tokenPricing.citation;
    }

    // 2. Calculate Action Costs
    const { actionPricing } = pricing;
    if (actionPricing.requestFeesByTier && apiTier) {
        const requestFeePerThousand = actionPricing.requestFeesByTier[apiTier];
        if (requestFeePerThousand !== undefined) {
            cost += requestFeePerThousand / PER_THOUSAND; // Cost for a single request
        } else {
            logger.warning(`API tier '${apiTier}' not found for model ${model}. Request fee not applied.`, { ...context, operation, model });
        }
    }

    if (actionPricing.searchQueryFee && usage.search_queries) {
        cost += (usage.search_queries / PER_THOUSAND) * actionPricing.searchQueryFee;
    }

    logger.debug(`Calculated cost for model ${model}`, {
        ...context,
        operation,
        model,
        usage,
        apiTier: apiTier ?? 'N/A',
        estimatedCost: cost,
    });

    // Return cost rounded to a reasonable number of decimal places (e.g., 6)
    return parseFloat(cost.toFixed(6));
}

export const costTracker = {
    calculatePerplexityCost,
};
