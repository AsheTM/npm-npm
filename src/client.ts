import { getDownloads, getDownloadsBulk, getDownloadsRange } from './downloads.ts';
import type { DownloadPeriod, DownloadsPoint, DownloadsRange } from './downloads.types.ts';
import { getPeerDependencies, getTypesInfo, isDeprecated } from './helpers.ts';
import type { PeerDependency, TypesInfo } from './helpers.ts';
import type { NpmApiOptions } from './options.ts';
import type { AbbreviatedPackument, DistTags, PackageVersion, Packument } from './package.types.ts';
import { getAbbreviatedPackage, getDistTags, getLatestVersion, getPackage, getVersion } from './packages.ts';
import { searchPackages } from './search.ts';
import type { SearchOptions, SearchQuery, SearchResult } from './search.types.ts';
import { getUserPackages } from './users.ts';

// The functions with defaults applied; per-call options override them
export interface NpmClient {
  readonly defaults: Readonly<NpmApiOptions>;
  getPackage(name: string, options?: NpmApiOptions): Promise<Packument>;
  getAbbreviatedPackage(name: string, options?: NpmApiOptions): Promise<AbbreviatedPackument>;
  getVersion(name: string, versionOrTag: string, options?: NpmApiOptions): Promise<PackageVersion>;
  getLatestVersion(name: string, options?: NpmApiOptions): Promise<string>;
  getDistTags(name: string, options?: NpmApiOptions): Promise<DistTags>;
  searchPackages(query: string | SearchQuery, options?: SearchOptions & NpmApiOptions): Promise<SearchResult>;
  getDownloads(name: string, period?: DownloadPeriod, options?: NpmApiOptions): Promise<DownloadsPoint>;
  getDownloadsRange(name: string, period?: DownloadPeriod, options?: NpmApiOptions): Promise<DownloadsRange>;
  getDownloadsBulk(
    names: readonly string[],
    period?: DownloadPeriod,
    options?: NpmApiOptions,
  ): Promise<Record<string, DownloadsPoint | null>>;
  isDeprecated(name: string, versionOrTag?: string, options?: NpmApiOptions): Promise<boolean>;
  getPeerDependencies(name: string, versionOrTag?: string, options?: NpmApiOptions): Promise<Record<string, PeerDependency>>;
  getTypesInfo(name: string, versionOrTag?: string, options?: NpmApiOptions): Promise<TypesInfo>;
  getUserPackages(username: string, options?: NpmApiOptions): Promise<string[]>;
}

// Per-call options win; headers are merged (per-call headers win too)
export const mergeOptions: (defaults: NpmApiOptions, options?: NpmApiOptions) => NpmApiOptions = (defaults, options) => {
  if (!options) {
    return defaults;
  }

  const merged: NpmApiOptions = { ...defaults, ...options };

  if (defaults.headers || options.headers) {
    merged.headers = { ...defaults.headers, ...options.headers };
  }

  return merged;
};

// `size` / `from` are per call only
const pickSearchOptions: (options?: SearchOptions) => SearchOptions = (options) => ({
  ...(options?.size === undefined ? {} : { size: options.size }),
  ...(options?.from === undefined ? {} : { from: options.from }),
});

// A client for a mirror registry, a custom `fetch`, shared headers...
export const createNpmClient: (defaults?: NpmApiOptions) => NpmClient = (defaults = {}) => {
  const frozen: Readonly<NpmApiOptions> = Object.freeze({ ...defaults, ...(defaults.headers ? { headers: { ...defaults.headers } } : {}) });
  const withDefaults: (options?: NpmApiOptions) => NpmApiOptions = (options) => mergeOptions(frozen, options);

  return {
    defaults: frozen,
    getPackage: (name, options) => getPackage(name, withDefaults(options)),
    getAbbreviatedPackage: (name, options) => getAbbreviatedPackage(name, withDefaults(options)),
    getVersion: (name, versionOrTag, options) => getVersion(name, versionOrTag, withDefaults(options)),
    getLatestVersion: (name, options) => getLatestVersion(name, withDefaults(options)),
    getDistTags: (name, options) => getDistTags(name, withDefaults(options)),
    searchPackages: (query, options) => searchPackages(query, { ...withDefaults(options), ...pickSearchOptions(options) }),
    getDownloads: (name, period, options) => getDownloads(name, period, withDefaults(options)),
    getDownloadsRange: (name, period, options) => getDownloadsRange(name, period, withDefaults(options)),
    getDownloadsBulk: (names, period, options) => getDownloadsBulk(names, period, withDefaults(options)),
    isDeprecated: (name, versionOrTag, options) => isDeprecated(name, versionOrTag, withDefaults(options)),
    getPeerDependencies: (name, versionOrTag, options) => getPeerDependencies(name, versionOrTag, withDefaults(options)),
    getTypesInfo: (name, versionOrTag, options) => getTypesInfo(name, versionOrTag, withDefaults(options)),
    getUserPackages: (username, options) => getUserPackages(username, withDefaults(options)),
  };
};
