# @ashetm/npm

`@ashetm/npm` is a small, typed client for npm's official public APIs: package documents, versions and dist-tags. It is built on `fetch` and nothing else, so it runs in Node 18+, browsers, Angular, React or a CLI. It is safe on the server (Node, SSR): it never throws `window is not defined`.

It is plain TypeScript (no framework), shipped as ESM with type definitions and `"sideEffects": false`.

It only calls the official registry, `https://registry.npmjs.org`, which allows browser requests (CORS).

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
  getLatestVersion,
  getPackage,
  getVersion,
  isValidPackageName,
  NpmApiError,
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
| `downloadsApi` | `https://api.npmjs.org/downloads` | The downloads API base URL (used by the coming download functions). |
| `headers`      | none                              | Extra request headers.                                          |

A `User-Agent` header is only sent on the server. Browsers forbid it.

### Client

`createNpmClient(defaults)` returns the same functions with the defaults applied. Per-call options override them, and headers are merged.

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
| `'invalid-name'`     | The package name (or version) is invalid. No request is sent.            |
| `'not-found'`        | The registry answered 404 (unknown package or version).                  |
| `'rate-limited'`     | The registry answered 429. `retryAfter` holds the `Retry-After` value in seconds, when sent. |
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

All the types are exported: `NpmApiOptions`, `NpmApiError`, `NpmApiErrorCode`, `NpmClient`, `Packument`, `AbbreviatedPackument`, `PackageVersion`, `AbbreviatedVersion`, `VersionBase`, `DistTags`, `Dist`, `DistSignature`, `PackumentTime`, `PeerDependencyMeta`, `Person`, `Repository`, `Bugs`.

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
