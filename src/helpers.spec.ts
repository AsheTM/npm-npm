import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import { getPeerDependencies, getTypesInfo, hasBundledTypes, isDeprecated, toPeerDependencies, toTypesPackageName } from './helpers.ts';
import type { PeerDependency, TypesInfo } from './helpers.ts';
import type { PackageVersion } from './package.types.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';
import { versionDocument } from './testing/fixtures.ts';

const hasCode: (code: string) => (error: unknown) => boolean = (code) => (error) => error instanceof NpmApiError && error.code === code;

describe('isDeprecated', () => {
  it('should return true for a deprecated latest version', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(versionDocument('request', '2.88.2', { deprecated: 'request has been deprecated' })));

    // WHEN
    const result: boolean = await isDeprecated('request', undefined, { fetch: fake.fetch });

    // THEN
    assert.equal(result, true);
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/request/latest');
  });

  it('should return false for a version that is not deprecated', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(versionDocument('@angular/core', '1.0.0')));

    // WHEN
    const result: boolean = await isDeprecated('@angular/core', '1.0.0', { fetch: fake.fetch });

    // THEN
    assert.equal(result, false);
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/@angular%2Fcore/1.0.0');
  });

  it('should return false for an un-deprecated version (empty message)', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(versionDocument('react', '1.0.0', { deprecated: '' })));

    // WHEN
    const result: boolean = await isDeprecated('react', '1.0.0', { fetch: fake.fetch });

    // THEN
    assert.equal(result, false);
  });

  it('should throw `not-found` for an unknown version', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse('version not found: 9.9.9', { status: 404 }));

    // WHEN
    const promise: Promise<boolean> = isDeprecated('react', '9.9.9', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('not-found'));
  });
});

describe('toPeerDependencies', () => {
  it('should merge ranges and optional flags', () => {
    // GIVEN
    const version: PackageVersion = versionDocument('@angular/core', '22.0.0', {
      peerDependencies: { rxjs: '^7.4.0', 'zone.js': '~0.16.0' },
      peerDependenciesMeta: { 'zone.js': { optional: true } },
    }) as unknown as PackageVersion;

    // WHEN
    const result: Record<string, PeerDependency> = toPeerDependencies(version);

    // THEN
    assert.deepEqual(result, {
      rxjs: { range: '^7.4.0', optional: false },
      'zone.js': { range: '~0.16.0', optional: true },
    });
  });

  it('should treat a peer only in `peerDependenciesMeta` as optional, any version', () => {
    // GIVEN
    const version: PackageVersion = versionDocument('x', '1.0.0', {
      peerDependenciesMeta: { typescript: { optional: true }, eslint: {} },
    }) as unknown as PackageVersion;

    // WHEN
    const result: Record<string, PeerDependency> = toPeerDependencies(version);

    // THEN
    assert.deepEqual(result, {
      typescript: { range: '*', optional: true },
      eslint: { range: '*', optional: true },
    });
  });

  it('should return an empty object without peers', () => {
    // GIVEN
    const version: PackageVersion = versionDocument('x', '1.0.0') as unknown as PackageVersion;

    // WHEN
    const result: Record<string, PeerDependency> = toPeerDependencies(version);

    // THEN
    assert.deepEqual(result, {});
  });
});

describe('getPeerDependencies', () => {
  it('should request the latest version by default', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(versionDocument('react-dom', '19.0.0', { peerDependencies: { react: '^19.0.0' } })));

    // WHEN
    const result: Record<string, PeerDependency> = await getPeerDependencies('react-dom', undefined, { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/react-dom/latest');
    assert.deepEqual(result, { react: { range: '^19.0.0', optional: false } });
  });

  it('should request a given version', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(versionDocument('react-dom', '18.0.0')));

    // WHEN
    await getPeerDependencies('react-dom', '18.0.0', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/react-dom/18.0.0');
  });
});

describe('toTypesPackageName', () => {
  for (const [name, expected] of [
    ['react', '@types/react'],
    ['@babel/core', '@types/babel__core'],
    ['lodash.debounce', '@types/lodash.debounce'],
  ] as const) {
    it(`should map ${name} to ${expected}`, () => {
      // GIVEN
      // a package name

      // WHEN
      const result: string = toTypesPackageName(name);

      // THEN
      assert.equal(result, expected);
    });
  }
});

describe('hasBundledTypes', () => {
  const cases: [string, Record<string, unknown>, boolean][] = [
    ['`types`', { types: 'index.d.ts' }, true],
    ['`typings`', { typings: './types/core.d.ts' }, true],
    ['a `types` condition in `exports`', { exports: { '.': { types: { default: './index.d.ts' }, default: './index.js' } } }, true],
    ['a `.d.mts` path in `exports`', { exports: { '.': { import: ['./a.d.mts', './a.mjs'] } } }, true],
    ['an `@types/*` package', { name: '@types/node' }, true],
    ['nothing', { main: 'index.js', exports: { '.': './index.js' } }, false],
    ['an empty `types`', { types: '' }, false],
  ];

  for (const [label, extra, expected] of cases) {
    it(`should return ${expected} with ${label}`, () => {
      // GIVEN
      const version: PackageVersion = versionDocument('x', '1.0.0', extra) as unknown as PackageVersion;

      // WHEN
      const result: boolean = hasBundledTypes(version);

      // THEN
      assert.equal(result, expected);
    });
  }
});

describe('getTypesInfo', () => {
  // `name@version` → document; anything else → 404
  const registry: (documents: Record<string, Record<string, unknown>>) => FakeFetch = (documents) =>
    fakeFetch((url) => {
      const key: string = decodeURIComponent(url.replace('https://registry.npmjs.org/', ''));

      return documents[key] ? jsonResponse(documents[key]) : jsonResponse({ error: 'Not found' }, { status: 404 });
    });

  it('should find bundled types with one request', async () => {
    // GIVEN
    const fake: FakeFetch = registry({ 'axios/latest': versionDocument('axios', '1.0.0', { types: 'index.d.ts' }) });

    // WHEN
    const result: TypesInfo = await getTypesInfo('axios', undefined, { fetch: fake.fetch });

    // THEN
    assert.deepEqual(result, { source: 'bundled', types: 'index.d.ts' });
    assert.equal(fake.calls.length, 1);
  });

  it('should find bundled types declared in `exports` only', async () => {
    // GIVEN
    const fake: FakeFetch = registry({ 'x/1.0.0': versionDocument('x', '1.0.0', { exports: { '.': { types: './x.d.ts' } } }) });

    // WHEN
    const result: TypesInfo = await getTypesInfo('x', '1.0.0', { fetch: fake.fetch });

    // THEN
    assert.deepEqual(result, { source: 'bundled' });
  });

  it('should find an `@types/*` package for a scoped package', async () => {
    // GIVEN
    const fake: FakeFetch = registry({
      '@babel/core/latest': versionDocument('@babel/core', '7.0.0'),
      '@types/babel__core/latest': versionDocument('@types/babel__core', '7.20.5'),
    });

    // WHEN
    const result: TypesInfo = await getTypesInfo('@babel/core', undefined, { fetch: fake.fetch });

    // THEN
    assert.deepEqual(result, { source: 'definitely-typed', typesPackage: '@types/babel__core', typesVersion: '7.20.5' });
    assert.equal(fake.calls[1]?.url, 'https://registry.npmjs.org/@types%2Fbabel__core/latest');
  });

  it('should ignore a deprecated `@types/*` stub', async () => {
    // GIVEN
    const fake: FakeFetch = registry({
      'x/latest': versionDocument('x', '1.0.0'),
      '@types/x/latest': versionDocument('@types/x', '0.1.0', { deprecated: 'This is a stub types definition.' }),
    });

    // WHEN
    const result: TypesInfo = await getTypesInfo('x', undefined, { fetch: fake.fetch });

    // THEN
    assert.deepEqual(result, { source: 'none' });
  });

  it('should return `none` when there is no `@types/*` package', async () => {
    // GIVEN
    const fake: FakeFetch = registry({ 'x/latest': versionDocument('x', '1.0.0') });

    // WHEN
    const result: TypesInfo = await getTypesInfo('x', undefined, { fetch: fake.fetch });

    // THEN
    assert.deepEqual(result, { source: 'none' });
  });

  it('should throw `not-found` when the package itself is unknown', async () => {
    // GIVEN
    const fake: FakeFetch = registry({});

    // WHEN
    const promise: Promise<TypesInfo> = getTypesInfo('x', undefined, { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('not-found'));
  });

  it('should rethrow other errors from the `@types/*` request', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch((url) =>
      url.includes('@types') ? jsonResponse({}, { status: 503 }) : jsonResponse(versionDocument('x', '1.0.0')),
    );

    // WHEN
    const promise: Promise<TypesInfo> = getTypesInfo('x', undefined, { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('http'));
  });
});
