/**
 * @fileoverview Provides caching utilities for API responses and file attachments.
 * Uses LRU (Least Recently Used) eviction with configurable TTLs and memory limits.
 * Includes request deduplication to prevent duplicate concurrent API calls.
 * @module src/utils/cache/cacheService
 */

import { LRUCache } from "lru-cache";
import crypto from "crypto";
import stableStringify from "fast-json-stable-stringify";
import { logger } from "../internal/logger.js";
import { RequestContext } from "../internal/requestContext.js";

/**
 * Cache TTL configuration by query type.
 * Based on research: Perplexity API responses are NOT deterministic,
 * so TTLs are tuned per query volatility.
 */
export const CACHE_TTL = {
  /** 1 hour - stable technical information */
  technical: 1000 * 60 * 60,
  /** 30 min - general knowledge queries */
  general: 1000 * 60 * 30,
  /** 5 min - volatile data (news, prices) */
  volatile: 1000 * 60 * 5,
  /** 2 hours - expensive deep research results */
  deepResearch: 1000 * 60 * 60 * 2,
  /** 1 hour - file attachment content */
  file: 1000 * 60 * 60,
} as const;

/**
 * Default cache configuration values.
 */
const CACHE_CONFIG = {
  /** Maximum number of response cache entries */
  responseMaxEntries: 500,
  /** Maximum total size for response cache (50MB) */
  responseMaxSize: 50 * 1024 * 1024,
  /** Maximum number of file cache entries */
  fileMaxEntries: 100,
  /** Maximum total size for file cache (100MB) */
  fileMaxSize: 100 * 1024 * 1024,
} as const;

/**
 * Structure for cached API responses.
 */
interface CachedResponse {
  /** The cached response data */
  data: unknown;
  /** Unix timestamp when cached */
  timestamp: number;
  /** The model used for this response */
  model: string;
}

/**
 * Structure for cached file content.
 */
interface CachedFile {
  /** Base64-encoded file content */
  base64: string;
  /** MIME type of the file */
  mimeType: string;
  /** Original source URL if fetched from URL */
  sourceUrl?: string;
  /** Size in bytes for cache size calculation */
  size: number;
}

/**
 * Response cache: keyed by hash of (query + params).
 * Uses LRU eviction with memory size limits.
 */
const responseCache = new LRUCache<string, CachedResponse>({
  max: CACHE_CONFIG.responseMaxEntries,
  ttl: CACHE_TTL.general,
  sizeCalculation: (value) => {
    try {
      return JSON.stringify(value.data).length;
    } catch {
      return 1000; // Fallback size estimate
    }
  },
  maxSize: CACHE_CONFIG.responseMaxSize,
  dispose: (value, key, reason) => {
    logger.debug(`Response cache entry disposed: ${key.substring(0, 16)}... reason: ${reason}`, {
      requestId: "cache-dispose",
      timestamp: new Date().toISOString(),
      cacheType: "response",
      reason,
    });
  },
});

/**
 * In-flight request deduplication map.
 * Prevents duplicate concurrent API calls for the same query.
 */
const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * File content cache: keyed by SHA256 of content or URL.
 * Used for multimodal file attachments.
 */
const fileCache = new LRUCache<string, CachedFile>({
  max: CACHE_CONFIG.fileMaxEntries,
  ttl: CACHE_TTL.file,
  sizeCalculation: (value) => value.size,
  maxSize: CACHE_CONFIG.fileMaxSize,
  dispose: (value, key, reason) => {
    logger.debug(`File cache entry disposed: ${key.substring(0, 16)}... reason: ${reason}`, {
      requestId: "cache-dispose",
      timestamp: new Date().toISOString(),
      cacheType: "file",
      reason,
    });
  },
});

/**
 * Generates a deterministic cache key from request parameters.
 * Uses stable JSON serialization + SHA256 hashing for collision resistance.
 *
 * @param params - The request parameters to hash
 * @returns A SHA256 hex digest cache key
 */
export function generateCacheKey(params: Record<string, unknown>): string {
  const serialized = stableStringify(params);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Retrieves a cached API response.
 *
 * @param key - The cache key (from generateCacheKey)
 * @returns The cached response or undefined if not found/expired
 */
export function getCachedResponse(key: string): CachedResponse | undefined {
  const cached = responseCache.get(key);
  if (cached) {
    logger.debug("Response cache hit", {
      requestId: "cache-hit",
      timestamp: new Date().toISOString(),
      cacheKey: key.substring(0, 16),
      model: cached.model,
      age: Date.now() - cached.timestamp,
    });
  }
  return cached;
}

/**
 * Stores an API response in the cache.
 *
 * @param key - The cache key
 * @param data - The response data to cache
 * @param model - The model name (for logging)
 * @param ttlMs - Optional custom TTL in milliseconds
 */
export function setCachedResponse(
  key: string,
  data: unknown,
  model: string,
  ttlMs?: number
): void {
  responseCache.set(
    key,
    { data, timestamp: Date.now(), model },
    ttlMs ? { ttl: ttlMs } : undefined
  );
  logger.debug("Response cached", {
    requestId: "cache-set",
    timestamp: new Date().toISOString(),
    cacheKey: key.substring(0, 16),
    model,
    ttl: ttlMs ?? CACHE_TTL.general,
  });
}

/**
 * Executes a request with deduplication.
 * If an identical request is already in-flight, returns the existing promise
 * instead of making a duplicate API call.
 *
 * @param key - The cache key for the request
 * @param fetcher - Async function that performs the actual request
 * @param context - Request context for logging
 * @returns The request result (shared if deduplicated)
 */
export async function deduplicatedRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
  context: RequestContext
): Promise<T> {
  // Check if request is already in-flight
  if (inFlightRequests.has(key)) {
    logger.debug("Request deduplicated (in-flight)", {
      ...context,
      cacheKey: key.substring(0, 16),
      deduplication: true,
    });
    return inFlightRequests.get(key) as Promise<T>;
  }

  // Execute and cache the promise
  const promise = fetcher().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Computes a SHA256 hash of file content for deduplication.
 *
 * @param content - The file content (string or Buffer)
 * @returns SHA256 hex digest
 */
export function getFileContentHash(content: string | Buffer): string {
  const data = typeof content === "string" ? content : content.toString("base64");
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Retrieves a cached file.
 *
 * @param hash - The file content hash
 * @returns The cached file or undefined if not found/expired
 */
export function getCachedFile(hash: string): CachedFile | undefined {
  const cached = fileCache.get(hash);
  if (cached) {
    logger.debug("File cache hit", {
      requestId: "cache-hit",
      timestamp: new Date().toISOString(),
      fileHash: hash.substring(0, 16),
      mimeType: cached.mimeType,
      size: cached.size,
    });
  }
  return cached;
}

/**
 * Stores a file in the cache.
 *
 * @param hash - The file content hash
 * @param file - The file data to cache
 */
export function setCachedFile(hash: string, file: CachedFile): void {
  fileCache.set(hash, file);
  logger.debug("File cached", {
    requestId: "cache-set",
    timestamp: new Date().toISOString(),
    fileHash: hash.substring(0, 16),
    mimeType: file.mimeType,
    size: file.size,
    sourceUrl: file.sourceUrl ? file.sourceUrl.substring(0, 50) : undefined,
  });
}

/**
 * Returns current cache statistics for observability.
 *
 * @returns Object containing cache size and entry counts
 */
export function getCacheStats(): {
  responseCache: { size: number; calculatedSize: number | undefined };
  fileCache: { size: number; calculatedSize: number | undefined };
  inFlightRequests: number;
} {
  return {
    responseCache: {
      size: responseCache.size,
      calculatedSize: responseCache.calculatedSize,
    },
    fileCache: {
      size: fileCache.size,
      calculatedSize: fileCache.calculatedSize,
    },
    inFlightRequests: inFlightRequests.size,
  };
}

/**
 * Clears all caches. Useful for testing or manual cache invalidation.
 */
export function clearAllCaches(): void {
  responseCache.clear();
  fileCache.clear();
  inFlightRequests.clear();
  logger.info("All caches cleared", {
    requestId: "cache-clear",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Exported cache service object for convenient imports.
 */
export const cacheService = {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
  deduplicatedRequest,
  getFileContentHash,
  getCachedFile,
  setCachedFile,
  getCacheStats,
  clearAllCaches,
  CACHE_TTL,
};
