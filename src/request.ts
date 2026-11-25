import { isServer } from '@ashetm/platform';

import { CACHE } from './cache.ts';
import type { CacheEntry, ResponseCache } from './cache.ts';
import { NpmApiError } from './error.ts';
import type { NpmApiOptions, RetryOptions } from './options.ts';

const USER_AGENT: string = '@ashetm/npm (+https://github.com/AsheTM/npm-npm)';

export interface RequestJsonInit {
  accept?: string;
  // Cached `etag`: a 304 then means "not modified"
  ifNoneMatch?: string;
}

// A JSON body with its `etag`, or "not modified" (304 to `ifNoneMatch`)
type JsonResult<T> = { notModified: false; body: T; etag?: string } | { notModified: true };

const isAbortError: (error: unknown) => boolean = (error) =>
  typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';

// `Retry-After` is either seconds or an HTTP date
export const parseRetryAfter: (value: string | null, now?: number) => number | undefined = (value, now = Date.now()) => {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  const seconds: number = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds);
  }

  const date: number = Date.parse(value);

  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
};

const buildHeaders: (options: NpmApiOptions | undefined, accept: string) => Record<string, string> = (options, accept) => ({
  accept,
  // Browsers forbid `User-Agent` (and it would trigger a CORS preflight): only sent on the server
  ...(isServer() ? { 'user-agent': USER_AGENT } : {}),
  ...options?.headers,
});

// One GET of `url`: its JSON body (an object), or an `NpmApiError`; an abort is rethrown as is
const requestOnce: <T extends object>(url: string, options?: NpmApiOptions, init?: RequestJsonInit) => Promise<JsonResult<T>> = async <
  T extends object,
>(
  url: string,
  options?: NpmApiOptions,
  init?: RequestJsonInit,
): Promise<JsonResult<T>> => {
  const fetchFn: typeof fetch | undefined = options?.fetch ?? globalThis.fetch;

  if (typeof fetchFn !== 'function') {
    throw new NpmApiError('No `fetch` available: pass one in the options', { code: 'network', url });
  }

  const headers: Record<string, string> = buildHeaders(options, init?.accept ?? 'application/json');

  if (init?.ifNoneMatch) {
    headers['if-none-match'] = init.ifNoneMatch;
  }

  const requestInit: RequestInit = { method: 'GET', headers };

  if (options?.signal) {
    requestInit.signal = options.signal;
  }

  let response: Response;

  try {
    response = await fetchFn(url, requestInit);
  } catch (error) {
    if (isAbortError(error) || options?.signal?.aborted) {
      throw error;
    }

    throw new NpmApiError(`Network error while requesting ${url}`, { code: 'network', url, cause: error });
  }

  if (response.status === 304 && init?.ifNoneMatch) {
    return { notModified: true };
  }

  if (response.status === 404) {
    throw new NpmApiError(`Not found: ${url}`, { code: 'not-found', url, status: 404 });
  }

  if (response.status === 429) {
    const retryAfter: number | undefined = parseRetryAfter(response.headers.get('retry-after'));

    throw new NpmApiError(`Rate limited: ${url}`, {
      code: 'rate-limited',
      url,
      status: 429,
      ...(retryAfter === undefined ? {} : { retryAfter }),
    });
  }

  if (!response.ok) {
    throw new NpmApiError(`HTTP ${response.status} for ${url}`, { code: 'http', url, status: response.status });
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch (error) {
    if (isAbortError(error) || options?.signal?.aborted) {
      throw error;
    }

    throw new NpmApiError(`Invalid JSON from ${url}`, { code: 'invalid-response', url, status: response.status, cause: error });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new NpmApiError(`Unexpected response from ${url}`, { code: 'invalid-response', url, status: response.status });
  }

  const etag: string | null = response.headers.get('etag');

  return { notModified: false, body: body as T, ...(etag ? { etag } : {}) };
};

export const DEFAULT_RETRY: Required<RetryOptions> = { attempts: 2, delay: 1, maxDelay: 60 };

// `retry` option → settings, or `undefined` when off
export const resolveRetry: (retry: NpmApiOptions['retry']) => Required<RetryOptions> | undefined = (retry) => {
  if (!retry) {
    return undefined;
  }

  const settings: Required<RetryOptions> = { ...DEFAULT_RETRY, ...(retry === true ? {} : retry) };

  return {
    attempts: Math.max(0, Math.trunc(settings.attempts)),
    delay: Math.max(0, settings.delay),
    maxDelay: Math.max(0, settings.maxDelay),
  };
};

// Waits `seconds`; rejects with the signal's reason when aborted
const sleep: (seconds: number, signal?: AbortSignal) => Promise<void> = (seconds, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);

      return;
    }

    const onAbort: () => void = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, seconds * 1000);

    signal?.addEventListener('abort', onAbort, { once: true });
  });

// `requestOnce`, retried on 429 with the `retry` option (after `Retry-After`, or an increasing delay)
const requestWithRetry: <T extends object>(url: string, options?: NpmApiOptions, init?: RequestJsonInit) => Promise<JsonResult<T>> = async <
  T extends object,
>(
  url: string,
  options?: NpmApiOptions,
  init?: RequestJsonInit,
): Promise<JsonResult<T>> => {
  const retry: Required<RetryOptions> | undefined = resolveRetry(options?.retry);

  for (let attempt: number = 0; ; attempt++) {
    try {
      return await requestOnce<T>(url, options, init);
    } catch (error) {
      if (!retry || attempt >= retry.attempts || !(error instanceof NpmApiError) || error.code !== 'rate-limited') {
        throw error;
      }

      const wait: number = error.retryAfter ?? retry.delay * 2 ** attempt;

      if (wait > retry.maxDelay) {
        throw error;
      }

      await sleep(wait, options?.signal);
    }
  }
};

// Options with a client's cache (see `CACHE`)
type CachedOptions = NpmApiOptions & { [CACHE]?: ResponseCache };

const bodyOf: <T>(result: JsonResult<T>, url: string) => T = (result, url) => {
  if (result.notModified) {
    throw new NpmApiError(`Unexpected 304 from ${url}`, { code: 'invalid-response', url, status: 304 });
  }

  return result.body;
};

const fromCache: <T extends object>(
  cache: ResponseCache,
  url: string,
  options: NpmApiOptions | undefined,
  init: RequestJsonInit | undefined,
) => Promise<T> = async <T extends object>(
  cache: ResponseCache,
  url: string,
  options: NpmApiOptions | undefined,
  init: RequestJsonInit | undefined,
): Promise<T> => {
  const key: string = `${init?.accept ?? 'application/json'} ${url}`;
  const entry: CacheEntry | undefined = cache.get(key);

  if (entry && cache.isFresh(entry)) {
    return structuredClone(entry.body) as T;
  }

  const pending: Promise<object> | undefined = cache.pending(key);

  if (pending) {
    try {
      return structuredClone(await pending) as T;
    } catch (error) {
      // Another caller aborted: make our own request, unless we were aborted too
      if (!isAbortError(error) || options?.signal?.aborted) {
        throw error;
      }
    }
  }

  // ETag revalidation: server only (browsers can't send `If-None-Match` to the registry, their HTTP cache does it)
  const ifNoneMatch: string | undefined = cache.etag && isServer() && entry?.etag ? entry.etag : undefined;

  const promise: Promise<T> = (async () => {
    const result: JsonResult<T> = await requestWithRetry<T>(url, options, { ...init, ...(ifNoneMatch ? { ifNoneMatch } : {}) });

    if (result.notModified) {
      cache.set(key, entry!.body, entry!.etag);

      return entry!.body as T;
    }

    cache.set(key, result.body, result.etag);

    return result.body;
  })();

  cache.track(key, promise);

  return structuredClone(await promise);
};

// GETs `url` and returns its JSON body (an object), or throws an `NpmApiError`; an abort is rethrown as is.
// With the `retry` option, a 429 is retried; in a client with `cache`, successful responses are reused (and revalidated by ETag).
export const requestJson: <T extends object>(url: string, options?: NpmApiOptions, init?: RequestJsonInit) => Promise<T> = async <
  T extends object,
>(
  url: string,
  options?: NpmApiOptions,
  init?: RequestJsonInit,
): Promise<T> => {
  const cache: ResponseCache | undefined = (options as CachedOptions | undefined)?.[CACHE];

  if (cache) {
    return fromCache<T>(cache, url, options, init);
  }

  return bodyOf(await requestWithRetry<T>(url, options, init), url);
};
