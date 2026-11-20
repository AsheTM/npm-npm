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
