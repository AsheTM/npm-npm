import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import type { AbbreviatedPackument, DistTags, PackageVersion, Packument } from './package.types.ts';
import { getAbbreviatedPackage, getDistTags, getLatestVersion, getPackage, getVersion } from './packages.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';
import { packumentDocument, versionDocument } from './testing/fixtures.ts';

const hasCode: (code: string) => (error: unknown) => boolean = (code) => (error) => error instanceof NpmApiError && error.code === code;

describe('getPackage', () => {
  it('should request an unscoped package', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(packumentDocument('react')));

    // WHEN
    const result: Packument = await getPackage('react', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/react');
    assert.equal(fake.calls[0]?.headers['accept'], 'application/json');
    assert.equal(result.name, 'react');
    assert.equal(result['dist-tags'].latest, '1.1.0');
  });

  it('should encode a scoped package', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(packumentDocument('@angular/core')));

    // WHEN
    await getPackage('@angular/core', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/@angular%2Fcore');
  });

  it('should use a mirror registry', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(packumentDocument('react')));

    // WHEN
    await getPackage('react', { fetch: fake.fetch, registry: 'https://registry.npmmirror.com/' });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmmirror.com/react');
  });

  it('should throw `invalid-name` without any request', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}));

    // WHEN
    const promise: Promise<Packument> = getPackage('../secret', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-name'));
    assert.equal(fake.calls.length, 0);
  });

  it('should throw `not-found` for an unknown package', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ error: 'Not found' }, { status: 404 }));

    // WHEN
    const promise: Promise<Packument> = getPackage('does-not-exist', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('not-found'));
  });

  it('should throw `invalid-response` for an unexpected document', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ hello: 'world' }));

    // WHEN
    const promise: Promise<Packument> = getPackage('react', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-response'));
  });
});

describe('getAbbreviatedPackage', () => {
  it('should ask for the abbreviated document', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() =>
      jsonResponse({
        name: '@angular/core',
        modified: '2026-03-01T00:00:00.000Z',
        'dist-tags': { latest: '1.0.0' },
        versions: { '1.0.0': versionDocument('@angular/core', '1.0.0') },
      }),
    );

    // WHEN
    const result: AbbreviatedPackument = await getAbbreviatedPackage('@angular/core', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/@angular%2Fcore');
    assert.match(fake.calls[0]?.headers['accept'] ?? '', /^application\/vnd\.npm\.install-v1\+json/);
    assert.equal(result.modified, '2026-03-01T00:00:00.000Z');
    assert.deepEqual(Object.keys(result.versions), ['1.0.0']);
  });
});

describe('getVersion', () => {
  it('should request a version by number', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(versionDocument('react', '1.2.3')));

    // WHEN
    const result: PackageVersion = await getVersion('react', '1.2.3', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/react/1.2.3');
    assert.equal(result.version, '1.2.3');
  });

  it('should request a scoped version by tag', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(versionDocument('@angular/core', '2.0.0')));

    // WHEN
    await getVersion('@angular/core', 'latest', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/@angular%2Fcore/latest');
  });

  it('should encode the version or tag', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(versionDocument('react', '1.0.0')));

    // WHEN
    await getVersion('react', '1.0.0+build/1', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/react/1.0.0%2Bbuild%2F1');
  });

  it('should throw `not-found` for an unknown version', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse('version not found: 9.9.9', { status: 404 }));

    // WHEN
    const promise: Promise<PackageVersion> = getVersion('react', '9.9.9', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('not-found'));
  });

  it('should throw `invalid-name` for an empty version without any request', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}));

    // WHEN
    const promise: Promise<PackageVersion> = getVersion('react', ' ', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-name'));
    assert.equal(fake.calls.length, 0);
  });
});

describe('getDistTags', () => {
  it('should request the dist-tags endpoint of a scoped package', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ latest: '1.0.0', next: '2.0.0-rc.0' }));

    // WHEN
    const result: DistTags = await getDistTags('@angular/core', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/-/package/@angular%2Fcore/dist-tags');
    assert.deepEqual(result, { latest: '1.0.0', next: '2.0.0-rc.0' });
  });

  it('should throw `invalid-response` without `latest`', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ next: '2.0.0' }));

    // WHEN
    const promise: Promise<DistTags> = getDistTags('react', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-response'));
  });
});

describe('getLatestVersion', () => {
  it('should return the `latest` tag', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ latest: '19.0.0', next: '20.0.0-rc.0' }));

    // WHEN
    const result: string = await getLatestVersion('react', { fetch: fake.fetch });

    // THEN
    assert.equal(result, '19.0.0');
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/-/package/react/dist-tags');
  });

  it('should pass the signal', async () => {
    // GIVEN
    const controller: AbortController = new AbortController();
    controller.abort();
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ latest: '1.0.0' }));

    // WHEN
    const promise: Promise<string> = getLatestVersion('react', { fetch: fake.fetch, signal: controller.signal });

    // THEN
    await assert.rejects(promise, (error: unknown) => (error as Error).name === 'AbortError');
  });
});
