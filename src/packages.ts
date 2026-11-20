import { NpmApiError } from './error.ts';
import { assertPackageName, encodeRegistryName } from './name.ts';
import { normalizeAbbreviatedPackument, normalizeDistTags, normalizePackument, normalizeVersion } from './normalize.ts';
import type { NpmApiOptions } from './options.ts';
import { getRegistryUrl } from './options.ts';
import type { AbbreviatedPackument, DistTags, PackageVersion, Packument } from './package.types.ts';
import { requestJson } from './request.ts';

const ABBREVIATED_ACCEPT: string = 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8';

const packageUrl: (name: string, options?: NpmApiOptions) => string = (name, options) => {
  assertPackageName(name);

  return `${getRegistryUrl(options)}/${encodeRegistryName(name)}`;
};

// The full package document: every version, dates, maintainers, readme...
export const getPackage: (name: string, options?: NpmApiOptions) => Promise<Packument> = async (name, options) => {
  const url: string = packageUrl(name, options);

  return normalizePackument(await requestJson(url, options), url);
};

// The smaller install document: versions with dependencies, `dist`, `engines`, `deprecated`
export const getAbbreviatedPackage: (name: string, options?: NpmApiOptions) => Promise<AbbreviatedPackument> = async (
  name,
  options,
) => {
  const url: string = packageUrl(name, options);

  return normalizeAbbreviatedPackument(await requestJson(url, options, { accept: ABBREVIATED_ACCEPT }), url);
};

// One version, by number (`'1.2.3'`) or dist-tag (`'latest'`, `'next'`)
export const getVersion: (name: string, versionOrTag: string, options?: NpmApiOptions) => Promise<PackageVersion> = async (
  name,
  versionOrTag,
  options,
) => {
  const base: string = packageUrl(name, options);

  if (typeof versionOrTag !== 'string' || versionOrTag.trim() === '') {
    throw new NpmApiError(`Invalid version or tag: ${JSON.stringify(versionOrTag)}`, { code: 'invalid-name', url: '' });
  }

  const url: string = `${base}/${encodeURIComponent(versionOrTag.trim())}`;

  return normalizeVersion(await requestJson(url, options), url);
};

// The dist-tags (`latest`, `next`...), from the small `/-/package/{name}/dist-tags` endpoint
export const getDistTags: (name: string, options?: NpmApiOptions) => Promise<DistTags> = async (name, options) => {
  assertPackageName(name);

  const url: string = `${getRegistryUrl(options)}/-/package/${encodeRegistryName(name)}/dist-tags`;

  return normalizeDistTags(await requestJson(url, options), url);
};

// The version behind the `latest` tag
export const getLatestVersion: (name: string, options?: NpmApiOptions) => Promise<string> = async (name, options) =>
  (await getDistTags(name, options)).latest;
