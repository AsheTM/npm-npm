import type { JsonValue } from '@ashetm/types';

import { NpmApiError } from './error.ts';
import type { NpmApiOptions } from './options.ts';
import type { PackageVersion } from './package.types.ts';
import { getVersion } from './packages.ts';

// One peer dependency: its version range and whether it is optional (`peerDependenciesMeta`)
export interface PeerDependency {
  range: string;
  optional: boolean;
}

// Peers of a version: `peerDependencies` merged with `peerDependenciesMeta`
export const toPeerDependencies: (version: PackageVersion) => Record<string, PeerDependency> = (version) => {
  const ranges: Record<string, string> = version.peerDependencies ?? {};
  const meta: Record<string, { optional?: boolean }> = version.peerDependenciesMeta ?? {};
  // npm treats a peer listed only in `peerDependenciesMeta` as an optional peer of any version
  const names: string[] = [...new Set([...Object.keys(ranges), ...Object.keys(meta)])];

  return Object.fromEntries(
    names.map((name) => [name, { range: ranges[name] ?? '*', optional: meta[name]?.optional === true || !(name in ranges) }]),
  );
};

// Peer dependencies of a version (default: `latest`), with their optional flag
export const getPeerDependencies: (
  name: string,
  versionOrTag?: string,
  options?: NpmApiOptions,
) => Promise<Record<string, PeerDependency>> = async (name, versionOrTag = 'latest', options) =>
  toPeerDependencies(await getVersion(name, versionOrTag, options));

// `true` when the version (default: `latest`) is deprecated; an empty deprecation message means "un-deprecated"
export const isDeprecated: (name: string, versionOrTag?: string, options?: NpmApiOptions) => Promise<boolean> = async (
  name,
  versionOrTag = 'latest',
  options,
) => {
  const version: PackageVersion = await getVersion(name, versionOrTag, options);

  return typeof version.deprecated === 'string' && version.deprecated.trim() !== '';
};

// Where the types of a package come from
export type TypesSource = 'bundled' | 'definitely-typed' | 'none';

export interface TypesInfo {
  source: TypesSource;
  // `bundled`: the `types` / `typings` entry, when the package declares one
  types?: string;
  // `definitely-typed`: the `@types/*` package and its latest version
  typesPackage?: string;
  typesVersion?: string;
}

// `react` → `@types/react`, `@babel/core` → `@types/babel__core`
export const toTypesPackageName: (name: string) => string = (name) =>
  `@types/${name.startsWith('@') ? name.slice(1).replace('/', '__') : name}`;

const DECLARATION_FILE: RegExp = /\.d\.[cm]?ts$/;

// A `types` condition or a `.d.ts` path anywhere in `exports`
const exportsHaveTypes: (value: JsonValue | undefined) => boolean = (value) => {
  if (typeof value === 'string') {
    return DECLARATION_FILE.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(exportsHaveTypes);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(([key, entry]) => key === 'types' || exportsHaveTypes(entry));
  }

  return false;
};

const nonEmpty: (value: unknown) => string | undefined = (value) =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

// `true` when the version declares its own types (`types`, `typings`, or `exports`)
export const hasBundledTypes: (version: PackageVersion) => boolean = (version) =>
  version.name.startsWith('@types/') ||
  nonEmpty(version.types) !== undefined ||
  nonEmpty(version.typings) !== undefined ||
  exportsHaveTypes(version.exports);

// Does a version (default: `latest`) ship its types, or is there a `@types/*` package? A deprecated `@types/*` stub doesn't count.
export const getTypesInfo: (name: string, versionOrTag?: string, options?: NpmApiOptions) => Promise<TypesInfo> = async (
  name,
  versionOrTag = 'latest',
  options,
) => {
  const version: PackageVersion = await getVersion(name, versionOrTag, options);

  if (hasBundledTypes(version)) {
    const types: string | undefined = nonEmpty(version.types) ?? nonEmpty(version.typings);

    return { source: 'bundled', ...(types === undefined ? {} : { types }) };
  }

  const typesPackage: string = toTypesPackageName(name);

  try {
    const definitelyTyped: PackageVersion = await getVersion(typesPackage, 'latest', options);

    if (nonEmpty(definitelyTyped.deprecated) === undefined) {
      return { source: 'definitely-typed', typesPackage, typesVersion: definitelyTyped.version };
    }
  } catch (error) {
    if (!(error instanceof NpmApiError && error.code === 'not-found')) {
      throw error;
    }
  }

  return { source: 'none' };
};
