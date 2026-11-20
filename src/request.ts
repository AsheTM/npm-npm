import { isServer } from '@ashetm/platform';

import { NpmApiError } from './error.ts';
import type { NpmApiOptions } from './options.ts';

const USER_AGENT: string = '@ashetm/npm (+https://github.com/AsheTM/npm-npm)';

export interface RequestJsonInit {
  accept?: string;
}

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

// GETs `url` and returns its JSON body (an object), or throws an `NpmApiError`; an abort is rethrown as is
export const requestJson: <T extends object>(url: string, options?: NpmApiOptions, init?: RequestJsonInit) => Promise<T> = async <
  T extends object,
>(
  url: string,
  options?: NpmApiOptions,
  init?: RequestJsonInit,
): Promise<T> => {
  const fetchFn: typeof fetch | undefined = options?.fetch ?? globalThis.fetch;

  if (typeof fetchFn !== 'function') {
    throw new NpmApiError('No `fetch` available: pass one in the options', { code: 'network', url });
  }

  const requestInit: RequestInit = { method: 'GET', headers: buildHeaders(options, init?.accept ?? 'application/json') };

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

  return body as T;
};
