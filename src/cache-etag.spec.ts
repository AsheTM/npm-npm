import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { createNpmClient } from './client.ts';
import type { NpmClient } from './client.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';
import { stubGlobal } from './testing/global.ts';

let restores: (() => void)[] = [];

afterEach(() => {
  restores.reverse().forEach((restore) => restore());
  restores = [];
});

// The registry: `latest` and `etag` change with `version`; answers 304 when `If-None-Match` matches
const registry: (state: { version: string; etag?: string }) => FakeFetch = (state) =>
  fakeFetch((_url) => {
    const ifNoneMatch: string | undefined = fake.calls[fake.calls.length - 1]?.headers['if-none-match'];

    if (state.etag && ifNoneMatch === state.etag) {
      return new Response(null, { status: 304, headers: { etag: state.etag } });
    }

    return jsonResponse({ latest: state.version }, state.etag ? { headers: { etag: state.etag } } : {});
  });

let fake: FakeFetch;

const sentIfNoneMatch: () => (string | undefined)[] = () => fake.calls.map((call) => call.headers['if-none-match']);

describe('createNpmClient cache ETag', () => {
  it('should revalidate an expired entry and reuse it on 304', async () => {
    // GIVEN
    fake = registry({ version: '1.0.0', etag: '"a"' });
    // ttl 0: every entry is expired at once
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: { ttl: 0 } });

    // WHEN
    const first: string = await client.getLatestVersion('react');
    const second: string = await client.getLatestVersion('react');

    // THEN
    assert.equal(first, '1.0.0');
    assert.equal(second, '1.0.0');
    assert.deepEqual(sentIfNoneMatch(), [undefined, '"a"']);
  });

  it('should replace the entry when the document changed', async () => {
    // GIVEN
    const state: { version: string; etag: string } = { version: '1.0.0', etag: '"a"' };
    fake = registry(state);
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: { ttl: 0 } });
    await client.getLatestVersion('react');

    // WHEN
    state.version = '2.0.0';
    state.etag = '"b"';
    const changed: string = await client.getLatestVersion('react');
    const again: string = await client.getLatestVersion('react');

    // THEN
    assert.equal(changed, '2.0.0');
    assert.equal(again, '2.0.0');
    assert.deepEqual(sentIfNoneMatch(), [undefined, '"a"', '"b"']);
  });

  it('should keep a revalidated entry for another `ttl`', async () => {
    // GIVEN
    fake = registry({ version: '1.0.0', etag: '"a"' });
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: { ttl: 0.05 } });
    await client.getLatestVersion('react');
    await new Promise((resolve) => setTimeout(resolve, 60));

    // WHEN
    await client.getLatestVersion('react');
    await client.getLatestVersion('react');

    // THEN
    assert.deepEqual(sentIfNoneMatch(), [undefined, '"a"']);
  });

  it('should make a plain request when the response had no `etag`', async () => {
    // GIVEN
    fake = registry({ version: '1.0.0' });
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: { ttl: 0 } });

    // WHEN
    await client.getLatestVersion('react');
    await client.getLatestVersion('react');

    // THEN
    assert.deepEqual(sentIfNoneMatch(), [undefined, undefined]);
  });

  it('should not revalidate with `etag: false`', async () => {
    // GIVEN
    fake = registry({ version: '1.0.0', etag: '"a"' });
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: { ttl: 0, etag: false } });

    // WHEN
    await client.getLatestVersion('react');
    await client.getLatestVersion('react');

    // THEN
    assert.deepEqual(sentIfNoneMatch(), [undefined, undefined]);
  });

  it('should not send `If-None-Match` in a browser', async () => {
    // GIVEN
    restores.push(stubGlobal('window', {}), stubGlobal('navigator', {}));
    fake = registry({ version: '1.0.0', etag: '"a"' });
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: { ttl: 0 } });

    // WHEN
    await client.getLatestVersion('react');
    await client.getLatestVersion('react');

    // THEN
    assert.deepEqual(sentIfNoneMatch(), [undefined, undefined]);
  });

  it('should not send `If-None-Match` without a cache', async () => {
    // GIVEN
    fake = registry({ version: '1.0.0', etag: '"a"' });
    const client: NpmClient = createNpmClient({ fetch: fake.fetch });

    // WHEN
    await client.getLatestVersion('react');
    await client.getLatestVersion('react');

    // THEN
    assert.deepEqual(sentIfNoneMatch(), [undefined, undefined]);
  });
});
