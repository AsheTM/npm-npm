import type { NpmApiOptions } from './options.ts';
import type { PackageVersion } from './package.types.ts';
import { getVersion } from './packages.ts';

// `true` when the version (default: `latest`) is deprecated; an empty deprecation message means "un-deprecated"
export const isDeprecated: (name: string, versionOrTag?: string, options?: NpmApiOptions) => Promise<boolean> = async (
  name,
  versionOrTag = 'latest',
  options,
) => {
  const version: PackageVersion = await getVersion(name, versionOrTag, options);

  return typeof version.deprecated === 'string' && version.deprecated.trim() !== '';
};
