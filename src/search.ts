import { NpmApiError } from './error.ts';
import { isObject } from './normalize.ts';
import type { NpmApiOptions } from './options.ts';
import { getRegistryUrl } from './options.ts';
import { requestJson } from './request.ts';
import type { SearchObject, SearchOptions, SearchQuery, SearchResult } from './search.types.ts';

export const MAX_SEARCH_SIZE: number = 250;

const clean: (value: string | undefined) => string = (value) => (value ?? '').trim().replace(/\s+/g, ' ');

// `{ text: 'http', author: 'jane', keywords: ['a', 'b'] }` → `'http author:jane keywords:a,b'`
export const buildSearchText: (query: string | SearchQuery) => string = (query) => {
  if (typeof query === 'string') {
    return clean(query);
  }

  const keywords: string = (Array.isArray(query.keywords) ? query.keywords : [query.keywords ?? ''])
    .map((keyword) => clean(keyword).replace(/\s/g, '-'))
    .filter((keyword) => keyword !== '')
    .join(',');

  const qualifiers: [string, string][] = [
    ['author', clean(query.author)],
    ['maintainer', clean(query.maintainer)],
    ['scope', clean(query.scope).replace(/^@/, '')],
    ['keywords', keywords],
    ['not', clean(query.not)],
    ['is', clean(query.is)],
  ];

  return [clean(query.text), ...qualifiers.filter(([, value]) => value !== '').map(([key, value]) => `${key}:${value.replace(/\s/g, '-')}`)]
    .filter((part) => part !== '')
    .join(' ');
};

const toCount: (value: unknown) => number | undefined = (value) => {
  const count: number = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN;

  return Number.isFinite(count) ? count : undefined;
};

const normalizeSearchResult: (raw: Record<string, unknown>, url: string) => SearchResult = (raw, url) => {
  const objects: unknown = raw['objects'];

  if (!Array.isArray(objects) || !objects.every((object) => isObject(object) && isObject(object['package']))) {
    throw new NpmApiError(`Unexpected response from ${url}: search result`, { code: 'invalid-response', url });
  }

  return {
    objects: objects.map((object: Record<string, unknown>) => {
      const normalized: Record<string, unknown> = { ...object };
      const dependents: number | undefined = toCount(object['dependents']);

      if (dependents === undefined) {
        delete normalized['dependents'];
      } else {
        normalized['dependents'] = dependents;
      }

      return normalized as unknown as SearchObject;
    }),
    total: toCount(raw['total']) ?? objects.length,
    time: typeof raw['time'] === 'string' ? raw['time'] : '',
  };
};

const toInteger: (value: number, min: number, max: number) => number = (value, min, max) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

// Searches the registry (`/-/v1/search`) by text and qualifiers; `size` is kept between 1 and 250
export const searchPackages: (query: string | SearchQuery, options?: SearchOptions & NpmApiOptions) => Promise<SearchResult> = async (
  query,
  options,
) => {
  const text: string = buildSearchText(query);

  if (text === '') {
    throw new NpmApiError('Empty search query', { code: 'invalid-name', url: '' });
  }

  const params: URLSearchParams = new URLSearchParams({ text });

  if (options?.size !== undefined && Number.isFinite(options.size)) {
    params.set('size', String(toInteger(options.size, 1, MAX_SEARCH_SIZE)));
  }

  if (options?.from !== undefined && Number.isFinite(options.from)) {
    params.set('from', String(toInteger(options.from, 0, Number.MAX_SAFE_INTEGER)));
  }

  const url: string = `${getRegistryUrl(options)}/-/v1/search?${params.toString()}`;

  return normalizeSearchResult(await requestJson(url, options), url);
};
