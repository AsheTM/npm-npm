# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - Unreleased

### Added

- `searchPackages()`: search the registry by text and qualifiers (`author`, `maintainer`, `scope`, `keywords`, `not`, `is`), with `size` / `from`, typed results (`SearchResult`, `SearchObject`...), also on `createNpmClient()` ([#10](https://github.com/AsheTM/npm-npm/issues/10)).

## [1.0.0] - 2026-11-20

### Added

- Package functions: `getPackage()`, `getAbbreviatedPackage()`, `getVersion()`, `getLatestVersion()`, `getDistTags()`, with typed documents (`Packument`, `AbbreviatedPackument`, `PackageVersion`, `DistTags`...) and normalized `Person`, `Repository`, `Bugs` and `license` fields ([#4](https://github.com/AsheTM/npm-npm/issues/4)).
- `NpmApiOptions` (`fetch`, `signal`, `registry`, `downloadsApi`, `headers`), `NpmApiError` with `code`, `status`, `url`, `retryAfter`, and `isValidPackageName()` ([#3](https://github.com/AsheTM/npm-npm/issues/3)).
- `createNpmClient()`: the package functions with defaults applied ([#5](https://github.com/AsheTM/npm-npm/issues/5)).
- Opt-in live tests against the real registry: `npm run test:live` ([#6](https://github.com/AsheTM/npm-npm/issues/6)).
- ESM build with type definitions, `"sideEffects": false`, runtime dependencies `@ashetm/types` and `@ashetm/platform` only, Node 18+ ([#2](https://github.com/AsheTM/npm-npm/issues/2)).
