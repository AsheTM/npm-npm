# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - Unreleased

### Added

- `isDeprecated()`: whether a version (default `latest`) is deprecated ([#23](https://github.com/AsheTM/npm-npm/issues/23)).
- `getPeerDependencies()`: peer dependencies with their range and optional flag (`peerDependenciesMeta`) ([#24](https://github.com/AsheTM/npm-npm/issues/24)).
- `getTypesInfo()` and `toTypesPackageName()`: whether a package ships its types or has an `@types/*` package ([#25](https://github.com/AsheTM/npm-npm/issues/25)).
- All three on `createNpmClient()`.

## [1.3.0] - 2026-11-20

### Added

- `getDownloadsBulk()`: download counts of many packages at once (batches of 128 unscoped names, one request per scoped name, `null` for an unknown package), with `MAX_BULK_SIZE`, also on `createNpmClient()` ([#19](https://github.com/AsheTM/npm-npm/issues/19)).

## [1.2.0] - 2026-11-20

### Added

- `getDownloads()` and `getDownloadsRange()`: download counts from `https://api.npmjs.org/downloads` for a named period (`last-day`, `last-week`, `last-month`, `last-year`), a day or a range of days, with `isDownloadPeriod()`, also on `createNpmClient()` ([#14](https://github.com/AsheTM/npm-npm/issues/14)).
- `toDownloadPeriod()` and `toDownloadDate()`: build a download period from `Date`s, in UTC ([#15](https://github.com/AsheTM/npm-npm/issues/15)).

## [1.1.0] - 2026-11-20

### Added

- `searchPackages()`: search the registry by text and qualifiers (`author`, `maintainer`, `scope`, `keywords`, `not`, `is`), with `size` / `from`, typed results (`SearchResult`, `SearchObject`...), also on `createNpmClient()` ([#10](https://github.com/AsheTM/npm-npm/issues/10)).

## [1.0.0] - 2026-11-20

### Added

- Package functions: `getPackage()`, `getAbbreviatedPackage()`, `getVersion()`, `getLatestVersion()`, `getDistTags()`, with typed documents (`Packument`, `AbbreviatedPackument`, `PackageVersion`, `DistTags`...) and normalized `Person`, `Repository`, `Bugs` and `license` fields ([#4](https://github.com/AsheTM/npm-npm/issues/4)).
- `NpmApiOptions` (`fetch`, `signal`, `registry`, `downloadsApi`, `headers`), `NpmApiError` with `code`, `status`, `url`, `retryAfter`, and `isValidPackageName()` ([#3](https://github.com/AsheTM/npm-npm/issues/3)).
- `createNpmClient()`: the package functions with defaults applied ([#5](https://github.com/AsheTM/npm-npm/issues/5)).
- Opt-in live tests against the real registry: `npm run test:live` ([#6](https://github.com/AsheTM/npm-npm/issues/6)).
- ESM build with type definitions, `"sideEffects": false`, runtime dependencies `@ashetm/types` and `@ashetm/platform` only, Node 18+ ([#2](https://github.com/AsheTM/npm-npm/issues/2)).
