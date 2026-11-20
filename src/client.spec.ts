import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createNpmClient, mergeOptions } from './client.ts';
import type { NpmClient } from './client.ts';
import type { NpmApiOptions } from './options.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';
import { packumentDocument, versionDocument } from './testing/fixtures.ts';

const MIRROR: string = 'https://registry.npmmirror.com';

// Answers each registry URL with a matching document
const registryFetch: () => FakeFetch = () =>
  fakeFetch((url) => {
    if (url.includes('/dist-tags')) {
      return jsonResponse({ latest: '1.1.0' });
    }

    if (/\/(latest|\d+\.\d+\.\d+)$/.test(url)) {
      return jsonResponse(versionDocument('react', '1.1.0'));
    }

    return jsonResponse(packumentDocument('react'));
  });

describe('mergeOptions', () => {
  it('should return the defaults without per-call options', () => {
    // GIVEN
    const defaults: NpmApiOptions = { registry: MIRROR };

    // WHEN
    const result: NpmApiOptions = mergeOptions(defaults);

    // THEN
    assert.equal(result, defaults);
  });

  it('should let per-call options win and merge headers', () => {
    // GIVEN
    const defaults: NpmApiOptions = { registry: MIRROR, headers: { a: '1', b: '1' } };
    const options: NpmApiOptions = { registry: 'https://other.example', headers: { b: '2', c: '2' } };

    // WHEN
    const result: NpmApiOptions = mergeOptions(defaults, options);

    // THEN
    assert.deepEqual(result, { registry: 'https://other.example', headers: { a: '1', b: '2', c: '2' } });
  });
});

describe('createNpmClient', () => {
  it('should apply the defaults to every function', async () => {
    // GIVEN
    const fake: FakeFetch = registryFetch();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, registry: MIRROR, headers: { 'x-test': '1' } });

    // WHEN
    await client.getPackage('react');
    await client.getAbbreviatedPackage('react');
    await client.getVersion('react', 'latest');
    await client.getLatestVersion('react');
    await client.getDistTags('react');

    // THEN
    assert.deepEqual(
      fake.calls.map((call) => call.url),
      [
        `${MIRROR}/react`,
        `${MIRROR}/react`,
        `${MIRROR}/react/latest`,
        `${MIRROR}/-/package/react/dist-tags`,
        `${MIRROR}/-/package/react/dist-tags`,
      ],
    );
    assert.ok(fake.calls.every((call) => call.headers['x-test'] === '1'));
  });

  it('should search with the defaults and the per-call size', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ objects: [], total: 0, time: '' }));
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, registry: MIRROR });

    // WHEN
    await client.searchPackages({ text: 'react', author: 'jane' }, { size: 5 });

    // THEN
    assert.equal(fake.calls[0]?.url, `${MIRROR}/-/v1/search?text=react+author%3Ajane&size=5`);
  });

  it('should let per-call options override the defaults', async () => {
    // GIVEN
    const fake: FakeFetch = registryFetch();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, registry: MIRROR });

    // WHEN
    await client.getPackage('react', { registry: 'https://other.example' });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://other.example/react');
  });

  it('should use the public registry by default', async () => {
    // GIVEN
    const fake: FakeFetch = registryFetch();
    const client: NpmClient = createNpmClient();

    // WHEN
    await client.getLatestVersion('react', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/-/package/react/dist-tags');
  });

  it('should not be changed by later changes to the given defaults', async () => {
    // GIVEN
    const fake: FakeFetch = registryFetch();
    const defaults: NpmApiOptions = { fetch: fake.fetch, registry: MIRROR, headers: { 'x-test': '1' } };
    const client: NpmClient = createNpmClient(defaults);
    defaults.registry = 'https://changed.example';
    defaults.headers!['x-test'] = '2';

    // WHEN
    await client.getPackage('react');

    // THEN
    assert.equal(fake.calls[0]?.url, `${MIRROR}/react`);
    assert.equal(fake.calls[0]?.headers['x-test'], '1');
    assert.ok(Object.isFrozen(client.defaults));
  });
});
