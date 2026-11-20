import type { NpmApiOptions } from './options.ts';
import type { AbbreviatedPackument, DistTags, PackageVersion, Packument } from './package.types.ts';
import { getAbbreviatedPackage, getDistTags, getLatestVersion, getPackage, getVersion } from './packages.ts';

// The package functions with defaults applied; per-call options override them
export interface NpmClient {
  readonly defaults: Readonly<NpmApiOptions>;
  getPackage(name: string, options?: NpmApiOptions): Promise<Packument>;
  getAbbreviatedPackage(name: string, options?: NpmApiOptions): Promise<AbbreviatedPackument>;
  getVersion(name: string, versionOrTag: string, options?: NpmApiOptions): Promise<PackageVersion>;
  getLatestVersion(name: string, options?: NpmApiOptions): Promise<string>;
  getDistTags(name: string, options?: NpmApiOptions): Promise<DistTags>;
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
  };
};
