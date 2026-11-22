# @ashetm/npm

`@ashetm/npm` is a small, typed client for npm's official public APIs: package documents, versions, dist-tags, search, download counts, and the packages of a user or an organization. It is built on `fetch` and nothing else, so it runs in Node 18+, browsers, Angular, React or a CLI. It is safe on the server (Node, SSR): it never throws `window is not defined`.

It is plain TypeScript (no framework), shipped as ESM with type definitions and `"sideEffects": false`.

It only calls npm's official APIs, the registry (`https://registry.npmjs.org`) and the downloads API (`https://api.npmjs.org/downloads`). Both allow browser requests (CORS).

## Install

You can install it with npm:

```bash
npm install @ashetm/npm
```

## API

```ts
import {
  createNpmClient,
  getAbbreviatedPackage,
  getDistTags,
  getDownloads,
  getDownloadsBulk,
  getDownloadsRange,
  getLatestVersion,
  getOrgPackages,
  getPackage,
  getPeerDependencies,
  getTypesInfo,
  getUserPackages,
  getVersion,
  isDeprecated,
  isValidPackageName,
  NpmApiError,
  searchPackages,
  toDownloadPeriod,
} from '@ashetm/npm';
```

Every function takes an optional `options` object last and returns a `Promise`.

### Packages

| Function                                          | Returns                                                                                                            |
|---------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `getPackage(name, options?)`                      | `Packument`: the full package document (every version, `time`, `maintainers`, `author`, `readme`...).              |
| `getAbbreviatedPackage(name, options?)`           | `AbbreviatedPackument`: the smaller install document (versions with dependencies, `dist`, `engines`, `deprecated`). |
| `getVersion(name, versionOrTag, options?)`        | `PackageVersion`: one version, by number (`'1.2.3'`) or dist-tag (`'latest'`, `'next'`).                            |
| `getLatestVersion(name, options?)`                | `string`: the version behind the `latest` tag.                                                                     |
| `getDistTags(name, options?)`                     | `DistTags`: `{ latest: string, ...otherTags }`.                                                                    |

```ts
import { getLatestVersion, getPackage, getVersion } from '@ashetm/npm';

const latest: string = await getLatestVersion('@angular/core'); // e.g. '22.3.0'

const version = await getVersion('@angular/core', 'latest');
console.log(version.peerDependencies); // { rxjs: '^6.5.3 || ^7.4.0', ... }

const pkg = await getPackage('typescript');
console.log(pkg['dist-tags'].next, pkg.time.created, pkg.maintainers);
```

Scoped names (`@scope/name`) are encoded for you.

npm sends some fields in more than one format. They are normalized, so the types stay simple:

- `author` and `maintainers`: `"Name <email> (url)"` strings become `Person` objects: `{ name, email?, url? }`.
- `repository`: a string becomes `{ type: 'git', url }`.
- `bugs`: a string becomes `{ url }`.
- `license`: an old `{ type, url }` object becomes its `type`.

### Search

`searchPackages(query, options?)` searches the registry (`/-/v1/search`) and returns a `SearchResult`: `{ objects, total, time }`.

`query` is a string, or a `SearchQuery` with free text and npm's search qualifiers:

| Field        | Sent as                | Example                         |
|--------------|------------------------|---------------------------------|
| `text`       | the text itself        | `'http client'`                 |
| `author`     | `author:{value}`       | `'jane'`                        |
| `maintainer` | `maintainer:{value}`   | `'jane'`                        |
| `scope`      | `scope:{value}`        | `'angular'` (a leading `@` is removed) |
| `keywords`   | `keywords:{a,b}`       | `'ssr'` or `['ssr', 'browser']` |
| `not`        | `not:{value}`          | `'unstable'` or `'insecure'`    |
| `is`         | `is:{value}`           | `'unstable'` or `'insecure'`    |

The options also take `size` (results per page, 1 to 250, npm's default is 20) and `from` (offset).

```ts
import { searchPackages } from '@ashetm/npm';

const { objects, total } = await searchPackages({ text: 'platform', author: 'ashetm', keywords: ['ssr'] }, { size: 10 });

for (const { package: pkg, downloads, dependents } of objects) {
  console.log(pkg.name, pkg.version, downloads?.weekly, dependents);
}
```

Each `SearchObject` has `package` (`name`, `version`, `description`, `keywords`, `date`, `links`, `publisher`, `maintainers`...), `score`, `searchScore`, and when npm sends them `downloads` (`weekly`, `monthly`), `dependents` (a number) and `updated`.

An empty query throws an `NpmApiError` with code `'invalid-name'`, without a request.

The registry currently ignores some qualifiers (`scope:`, `is:`, `not:`). They are still sent as npm documents them.

### Downloads

| Function                                   | Returns                                                                       |
|--------------------------------------------|-------------------------------------------------------------------------------|
| `getDownloads(name, period?, options?)`      | `DownloadsPoint`: `{ downloads, start, end, package }`, the total over the period. |
| `getDownloadsRange(name, period?, options?)` | `DownloadsRange`: `{ downloads: [{ day, downloads }], start, end, package }`, one entry per day. |

`period` defaults to `'last-week'`. A `DownloadPeriod` is one of:

- a named period: `'last-day'`, `'last-week'`, `'last-month'` or `'last-year'` (the only ones the API accepts);
- one day: `'2026-01-07'`;
- a range of days: `'2026-01-01:2026-01-31'`. The API returns at most 18 months: it moves an earlier start forward.

Dates are in UTC. `toDownloadPeriod(start, end?)` builds a range from two `Date`s (`end` defaults to `start`), and `toDownloadDate(date)` formats one day. Both throw a `RangeError` for an invalid date or a start after the end.

```ts
import { getDownloads, getDownloadsRange, toDownloadPeriod } from '@ashetm/npm';

const { downloads } = await getDownloads('@angular/core'); // last week

const january = await getDownloadsRange('react', toDownloadPeriod(new Date('2026-01-01'), new Date('2026-01-31')));
console.log(january.downloads.map(({ day, downloads }) => `${day}: ${downloads}`));
```

A bad period throws an `NpmApiError` with code `'invalid-name'` without a request (`isDownloadPeriod(value)` checks it). An unknown package throws `'not-found'`.

### Bulk downloads

`getDownloadsBulk(names, period?, options?)` returns the `DownloadsPoint` of many packages at once, as `Record<string, DownloadsPoint | null>` in the order of `names` (duplicates removed). An unknown package gets `null` instead of an error.

```ts
import { getDownloadsBulk } from '@ashetm/npm';

const downloads = await getDownloadsBulk(['react', 'vue', '@angular/core', 'svelte'], 'last-month');

for (const [name, point] of Object.entries(downloads)) {
  console.log(name, point?.downloads ?? 'unknown package');
}
```

How the requests are sent:

- Unscoped names go in batches of up to 128 (`MAX_BULK_SIZE`), one request per batch.
- npm doesn't allow scoped names (`@scope/name`) in bulk requests, so each scoped name is a separate request.
- At most 4 requests run at the same time.
- npm limits bulk periods to 365 days: a longer range throws an `NpmApiError` with code `'http'`.

Any error other than an unknown package (`'rate-limited'`, `'network'`, an abort...) rejects the whole call.

### Helpers

Small answers on top of the package data. Each one takes `versionOrTag` (default `'latest'`) and makes one request (`getTypesInfo` may make two).

| Function                                              | Returns                                                                                 |
|-------------------------------------------------------|-----------------------------------------------------------------------------------------|
| `isDeprecated(name, versionOrTag?, options?)`         | `boolean`: `true` when the version has a deprecation message.                           |
| `getPeerDependencies(name, versionOrTag?, options?)`  | `Record<string, PeerDependency>`: `{ range, optional }` for each peer.                  |
| `getTypesInfo(name, versionOrTag?, options?)`         | `TypesInfo`: `{ source, types?, typesPackage?, typesVersion? }`.                        |

```ts
import { getPeerDependencies, getTypesInfo, isDeprecated } from '@ashetm/npm';

await isDeprecated('request'); // true

await getPeerDependencies('@angular/core');
// { rxjs: { range: '^6.5.3 || ^7.4.0', optional: false }, 'zone.js': { range: '~0.15.0 || ~0.16.0', optional: true }, ... }

await getTypesInfo('axios'); // { source: 'bundled', types: 'index.d.ts' }
await getTypesInfo('express'); // { source: 'definitely-typed', typesPackage: '@types/express', typesVersion: '5.0.6' }
```

- `getPeerDependencies` merges `peerDependencies` with `peerDependenciesMeta`. A peer listed only in `peerDependenciesMeta` is optional with range `'*'`, as npm treats it.
- `getTypesInfo` returns `'bundled'` when the version declares its types: `types`, `typings`, or a `types` condition or `.d.ts` file in `exports`. Otherwise it looks for `@types/{name}` (`@types/scope__name` for `@scope/name`, see `toTypesPackageName`) and returns `'definitely-typed'`. A deprecated `@types` stub doesn't count. If neither applies, it returns `'none'`. A package that ships an `index.d.ts` without declaring it isn't detected: that would need the tarball.

### User and organization packages

| Function                               | Returns                                                                  |
|----------------------------------------|--------------------------------------------------------------------------|
| `getUserPackages(username, options?)`  | `string[]`: the names of the user's packages, sorted.                    |
| `getOrgPackages(org, options?)`        | `string[]`: the names of the packages the organization has access to, sorted. `org` may start with `@`. |

```ts
import { getOrgPackages, getUserPackages } from '@ashetm/npm';

await getUserPackages('ashetm'); // ['@ashetm/npm', '@ashetm/platform', '@ashetm/types', ...]
await getOrgPackages('@angular'); // ['@angular/core', '@angular/router', 'angular-in-memory-web-api', ...]
```

The registry endpoints behind them (`/-/user/{username}/package` and `/-/org/{org}/package`) send no CORS header, so browsers can't call them:

- **`getUserPackages`**: on the server it calls `/-/user/{username}/package`, which returns the complete list in one request. In a browser or a web worker it uses the search (`maintainer:{username}`) instead, reading every page of 250. The search index can lag a few minutes behind a new package. An unknown user throws `'not-found'` on the server and returns `[]` in a browser.
- **`getOrgPackages`**: server only. In a browser the request fails with `'network'`. The list contains every package the organization has access to, not only its scope (`@angular` also lists `angular-in-memory-web-api`). An unknown organization throws `'not-found'`.

A username or organization name that isn't URL-safe throws `'invalid-name'` without a request.

### Package names

`isValidPackageName(name)` checks npm's rules for a new package name: lowercase, at most 214 characters, URL-safe, optionally `@scope/name`.

```ts
isValidPackageName('@ashetm/npm'); // true
isValidPackageName('Hello World'); // false
```

Before any request, every function checks the name and throws an `NpmApiError` with code `'invalid-name'` if it cannot exist. That check still accepts the older names npm serves, such as `JSONStream`.

### Options

| Option         | Default                           | Description                                                     |
|----------------|-----------------------------------|-----------------------------------------------------------------|
| `fetch`        | the global `fetch`                | A custom `fetch` (tests, proxies, a polyfill).                   |
| `signal`       | none                              | An `AbortSignal` that cancels the request.                      |
| `registry`     | `https://registry.npmjs.org`      | The registry base URL, for a mirror.                            |
| `downloadsApi` | `https://api.npmjs.org/downloads` | The downloads API base URL.                                     |
| `headers`      | none                              | Extra request headers.                                          |
| `retry`        | off                               | Retry after a 429: `true` or `RetryOptions` (see below).        |

A `User-Agent` header is only sent on the server. Browsers forbid it.

### Retry

npm answers 429 when you send too many requests. By default that throws an `NpmApiError` with code `'rate-limited'`. With the `retry` option, the request is retried:

```ts
import { createNpmClient, getDownloads } from '@ashetm/npm';

await getDownloads('react', 'last-week', { retry: true });

const npm = createNpmClient({ retry: { attempts: 3, delay: 2, maxDelay: 30 } });
```

| `RetryOptions` | Default | Description                                                                                  |
|----------------|---------|----------------------------------------------------------------------------------------------|
| `attempts`     | `2`     | Retries after the first request.                                                             |
| `delay`        | `1`     | Seconds to wait when the 429 has no `Retry-After` header, doubled at each retry.             |
| `maxDelay`     | `60`    | The longest wait, in seconds. If `Retry-After` asks for longer, `'rate-limited'` is thrown at once. |

- The wait follows `Retry-After` (seconds or an HTTP date) when npm sends it.
- Only 429 is retried.
- An abort during the wait stops it, and the `AbortError` is rethrown.
- With `getDownloadsBulk`, each request is retried on its own.

### Client

`createNpmClient(defaults)` returns the same functions (packages, search, downloads, helpers, user and organization packages) with the defaults applied. Per-call options override them, and headers are merged.

```ts
import { createNpmClient, type NpmClient } from '@ashetm/npm';

const npm: NpmClient = createNpmClient({ registry: 'https://registry.npmmirror.com' });

await npm.getLatestVersion('react');
await npm.getPackage('react', { signal: AbortSignal.timeout(5_000) });
```

### Errors

Every function throws an `NpmApiError` (it extends `Error`) when it cannot return the expected data:

| `code`               | When                                                                     |
|----------------------|--------------------------------------------------------------------------|
| `'invalid-name'`     | The package name, version, search query, download period, username or organization is invalid. No request is sent. |
| `'not-found'`        | The registry answered 404 (unknown package or version).                  |
| `'rate-limited'`     | The registry answered 429 (after the retries, with `retry`). `retryAfter` holds the `Retry-After` value in seconds, when sent. |
| `'http'`             | Any other HTTP error (`status` holds the code).                          |
| `'network'`          | `fetch` failed (offline, DNS, CORS...), or no `fetch` is available. `cause` holds the original error. |
| `'invalid-response'` | The body is not JSON, or not the expected document.                      |

The error also has `url` and `status?`. An abort is not wrapped: the `AbortError` from `fetch` is rethrown as is.

```ts
import { getPackage, NpmApiError } from '@ashetm/npm';

try {
  await getPackage('this-package-does-not-exist');
} catch (error) {
  if (error instanceof NpmApiError && error.code === 'not-found') {
    // ...
  }
}
```

## Angular

There's no need for an Angular library. Use `resource()`, which passes its `abortSignal`:

```ts
import { Component, resource, signal } from '@angular/core';
import { getPackage } from '@ashetm/npm';

@Component({
  selector: 'app-package',
  template: `
    @if (info.hasValue()) {
      <h2>{{ info.value().name }} {{ info.value()['dist-tags'].latest }}</h2>
      <p>{{ info.value().description }}</p>
    }
  `,
})
export class PackageComponent {
  readonly name = signal('@angular/core');

  readonly info = resource({
    params: () => this.name(),
    loader: ({ params, abortSignal }) => getPackage(params, { signal: abortSignal }),
  });
}
```

## Types

All the types are exported: `NpmApiOptions`, `RetryOptions`, `NpmApiError`, `NpmApiErrorCode`, `NpmClient`, `Packument`, `AbbreviatedPackument`, `PackageVersion`, `AbbreviatedVersion`, `VersionBase`, `DistTags`, `Dist`, `DistSignature`, `PackumentTime`, `PeerDependencyMeta`, `Person`, `Repository`, `Bugs`, `SearchQuery`, `SearchOptions`, `SearchResult`, `SearchObject`, `SearchPackage`, `SearchPackageLinks`, `SearchScore`, `SearchUser`, `DownloadPeriod`, `NamedDownloadPeriod`, `DownloadDate`, `DownloadsPoint`, `DownloadsRange`, `DailyDownloads`, `PeerDependency`, `TypesInfo`, `TypesSource`.

## Development

Node 24 (see `.nvmrc`).

```bash
npm install
npm run typecheck
npm test
npm run build
```

Tests use the Node test runner (`node --test`) and run the TypeScript sources directly. They never use the network: a fake `fetch` is passed through the options.

`npm run test:live` runs a few tests against the real registry. It is not part of `npm test` or `prepublishOnly`.

## License

[MIT](LICENSE)
