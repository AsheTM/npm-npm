import type { JsonValue } from '@ashetm/types';

import type { Person } from './person.ts';

// `latest` plus any other tag (`next`, `beta`...) → version
export type DistTags = { latest: string } & Record<string, string>;

// Source repository; a plain string from npm is normalized to `{ type: 'git', url }`
export interface Repository {
  type: string;
  url: string;
  directory?: string;
}

// Issue tracker; a plain string from npm is normalized to `{ url }`
export interface Bugs {
  url?: string;
  email?: string;
}

export interface DistSignature {
  keyid: string;
  sig: string;
}

// Where and how to download a version
export interface Dist {
  tarball: string;
  shasum: string;
  integrity?: string;
  fileCount?: number;
  unpackedSize?: number;
  signatures?: DistSignature[];
}

export interface PeerDependencyMeta {
  optional?: boolean;
}

// Fields shared by the full and the abbreviated version documents
export interface VersionBase {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, PeerDependencyMeta>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  // Deprecation message, when the version is deprecated
  deprecated?: string;
  dist: Dist;
}

// One version of a package (its `package.json` as published, plus `dist`)
export interface PackageVersion extends VersionBase {
  description?: string;
  main?: string;
  types?: string;
  typings?: string;
  exports?: JsonValue;
  license?: string;
  repository?: Repository;
  homepage?: string;
  keywords?: string[];
}

// `created`, `modified`, and the publish date of each version (ISO strings)
export type PackumentTime = { created: string; modified: string } & Record<string, string>;

// The full package document from the registry
export interface Packument {
  name: string;
  description?: string;
  'dist-tags': DistTags;
  versions: Record<string, PackageVersion>;
  time: PackumentTime;
  maintainers: Person[];
  author?: Person;
  license?: string;
  repository?: Repository;
  homepage?: string;
  bugs?: Bugs;
  keywords?: string[];
  readme?: string;
}

// One version in the abbreviated document: what an install needs
export interface AbbreviatedVersion extends VersionBase {
  bin?: Record<string, string>;
  bundleDependencies?: string[];
  os?: string[];
  cpu?: string[];
  hasInstallScript?: boolean;
}

// The smaller install document (`Accept: application/vnd.npm.install-v1+json`)
export interface AbbreviatedPackument {
  name: string;
  // Last change (ISO string)
  modified: string;
  'dist-tags': DistTags;
  versions: Record<string, AbbreviatedVersion>;
}
