import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import { getPeerDependencies, isDeprecated, toPeerDependencies } from './helpers.ts';
import type { PeerDependency } from './helpers.ts';
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
