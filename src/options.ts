// Retry after a 429 (rate limited)
export interface RetryOptions {
  // Retries after the first request (default: 2)
  attempts?: number;
  // Seconds to wait when the 429 has no `Retry-After`, doubled at each retry (default: 1)
  delay?: number;
  // Longest wait in seconds: a longer `Retry-After` throws `'rate-limited'` at once (default: 60)
  maxDelay?: number;
}

// Options accepted by every function, always as the last argument
export interface NpmApiOptions {
  // `fetch` implementation; defaults to the global `fetch` (Node 18+, browsers)
  fetch?: typeof fetch;
  // Cancels the request (e.g. Angular `resource()`'s `abortSignal`)
  signal?: AbortSignal;
  // Registry base URL, for mirrors; defaults to `https://registry.npmjs.org`
  registry?: string;
  // Downloads API base URL; defaults to `https://api.npmjs.org/downloads`
  downloadsApi?: string;
  // Extra request headers
  headers?: Record<string, string>;
  // Retry after a 429; off by default, `true` uses the default `RetryOptions`
  retry?: boolean | RetryOptions;
}

export const DEFAULT_REGISTRY: string = 'https://registry.npmjs.org';

export const DEFAULT_DOWNLOADS_API: string = 'https://api.npmjs.org/downloads';

const trimTrailingSlashes: (url: string) => string = (url) => url.replace(/\/+$/, '');

export const getRegistryUrl: (options?: NpmApiOptions) => string = (options) =>
  trimTrailingSlashes(options?.registry ?? DEFAULT_REGISTRY);

export const getDownloadsApiUrl: (options?: NpmApiOptions) => string = (options) =>
  trimTrailingSlashes(options?.downloadsApi ?? DEFAULT_DOWNLOADS_API);
