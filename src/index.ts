export { toDownloadDate, toDownloadPeriod } from './download-period.ts';
export { createNpmClient } from './client.ts';
export type { NpmClient } from './client.ts';
export { getDownloads, getDownloadsBulk, getDownloadsRange, isDownloadPeriod, MAX_BULK_SIZE } from './downloads.ts';
export type {
  DailyDownloads,
  DownloadDate,
  DownloadPeriod,
  DownloadsPoint,
  DownloadsRange,
  NamedDownloadPeriod,
} from './downloads.types.ts';
export { NpmApiError } from './error.ts';
export type { NpmApiErrorCode, NpmApiErrorInit } from './error.ts';
export { isDeprecated } from './helpers.ts';
export { isValidPackageName } from './name.ts';
export { DEFAULT_DOWNLOADS_API, DEFAULT_REGISTRY } from './options.ts';
export type { NpmApiOptions } from './options.ts';
export type {
  AbbreviatedPackument,
  AbbreviatedVersion,
  Bugs,
  Dist,
  DistSignature,
  DistTags,
  PackageVersion,
  Packument,
  PackumentTime,
  PeerDependencyMeta,
  Repository,
  VersionBase,
} from './package.types.ts';
export { getAbbreviatedPackage, getDistTags, getLatestVersion, getPackage, getVersion } from './packages.ts';
export type { Person } from './person.ts';
export { MAX_SEARCH_SIZE, searchPackages } from './search.ts';
export type {
  SearchObject,
  SearchOptions,
  SearchPackage,
  SearchPackageLinks,
  SearchQuery,
  SearchResult,
  SearchScore,
  SearchUser,
} from './search.types.ts';
