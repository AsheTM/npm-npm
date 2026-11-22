import { isServer } from '@ashetm/platform';

import { NpmApiError } from './error.ts';
import type { NpmApiOptions } from './options.ts';
import { getRegistryUrl } from './options.ts';
import { requestJson } from './request.ts';
import { MAX_SEARCH_SIZE, searchPackages } from './search.ts';
import type { SearchResult } from './search.types.ts';

// An npm username or org name: not empty, URL-safe, no `/`
const isValidAccountName: (name: string) => boolean = (name) =>
  typeof name === 'string' && name.length > 0 && name.trim() === name && encodeURIComponent(name) === name;

const assertAccountName: (name: string, label: string) => void = (name, label) => {
  if (!isValidAccountName(name)) {
    throw new NpmApiError(`Invalid npm ${label}: ${JSON.stringify(name)}`, { code: 'invalid-name', url: '' });
  }
};

// `{ "react": "write", ... }` → sorted names
const toSortedNames: (raw: Record<string, unknown>, url: string) => string[] = (raw, url) => {
  if (!Object.values(raw).every((access) => typeof access === 'string')) {
    throw new NpmApiError(`Unexpected response from ${url}: package list`, { code: 'invalid-response', url });
  }

  return Object.keys(raw).sort();
};

// Every page of `maintainer:{username}`, keeping the packages that really list this maintainer
const searchMaintainerPackages: (username: string, options?: NpmApiOptions) => Promise<string[]> = async (username, options) => {
  const names: Set<string> = new Set();

  for (let from: number = 0; ; from += MAX_SEARCH_SIZE) {
    const page: SearchResult = await searchPackages({ maintainer: username }, { ...options, size: MAX_SEARCH_SIZE, from });

    for (const { package: pkg } of page.objects) {
      if (pkg.maintainers.some((maintainer) => maintainer.username === username)) {
        names.add(pkg.name);
      }
    }

    if (page.objects.length < MAX_SEARCH_SIZE || from + MAX_SEARCH_SIZE >= page.total) {
      return [...names].sort();
    }
  }
};

// The sorted names of a user's packages.
// On the server: `/-/user/{username}/package`, complete in one request. In a browser (no CORS there): the search, every page.
export const getUserPackages: (username: string, options?: NpmApiOptions) => Promise<string[]> = async (username, options) => {
  assertAccountName(username, 'username');

  if (!isServer()) {
    return searchMaintainerPackages(username, options);
  }

  const url: string = `${getRegistryUrl(options)}/-/user/${username}/package`;

  return toSortedNames(await requestJson(url, options), url);
};

// The sorted names of the packages an organization has access to (`'angular'` or `'@angular'`), from `/-/org/{org}/package`.
// Not only its scope: e.g. `@angular` also lists `angular-in-memory-web-api`.
// Server only: the endpoint sends no CORS header, so a browser request fails with `'network'`.
export const getOrgPackages: (org: string, options?: NpmApiOptions) => Promise<string[]> = async (org, options) => {
  const name: string = typeof org === 'string' ? org.replace(/^@/, '') : org;

  assertAccountName(name, 'organization');

  const url: string = `${getRegistryUrl(options)}/-/org/${name}/package`;

  return toSortedNames(await requestJson(url, options), url);
};
