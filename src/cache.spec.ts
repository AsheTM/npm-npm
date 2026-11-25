import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_CACHE, ResponseCache, resolveCache } from './cache.ts';
import { createNpmClient } from './client.ts';
import type { NpmClient } from './client.ts';
import { NpmApiError } from './error.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';
import { packumentDocument } from './testing/fixtures.ts';

// A clock the test moves by hand
const clock: () => { now: () => number; advance: (seconds: number) => void } = () => {
  let time: number = 0;

  return { now: () => time, advance: (seconds) => (time += seconds * 1000) };
};

describe('ResponseCache', () => {
  it('should use the defaults', () => {
    // GIVEN
    // no options

    // WHEN
    const cache: ResponseCache = new ResponseCache();

    // THEN
    assert.deepEqual(DEFAULT_CACHE, { ttl: 300, maxEntries: 500, etag: true });
    assert.equal(cache.etag, true);
    assert.equal(cache.ttl, 300);
    assert.equal(cache.maxEntries, 500);
  });

  it('should return an entry until it expires', () => {
    // GIVEN
    const time: ReturnType<typeof clock> = clock();
    const cache: ResponseCache = new ResponseCache({ ttl: 10 }, time.now);
    cache.set('a', { value: 1 });

    // WHEN
    const before: unknown = cache.getFresh('a')?.body;
    time.advance(10);
    const after: unknown = cache.getFresh('a');

    // THEN
    assert.deepEqual(before, { value: 1 });
    assert.equal(after, undefined);
  });

  it('should drop the least recently used entry when full', () => {
    // GIVEN
    const cache: ResponseCache = new ResponseCache({ maxEntries: 2 });
    cache.set('a', {});
    cache.set('b', {});
    cache.getFresh('a');

    // WHEN
    cache.set('c', {});

    // THEN
    assert.equal(cache.size, 2);
    assert.ok(cache.getFresh('a'));
    assert.equal(cache.getFresh('b'), undefined);
    assert.ok(cache.getFresh('c'));
  });

  it('should empty on `clear()`', () => {
    // GIVEN
    const cache: ResponseCache = new ResponseCache();
    cache.set('a', {});

    // WHEN
    cache.clear();

    // THEN
    assert.equal(cache.size, 0);
  });
});

describe('resolveCache', () => {
  it('should be off by default', () => {
    // GIVEN
    // no `cache` option

    // WHEN
    const result: ResponseCache | undefined = resolveCache(undefined);

    // THEN
    assert.equal(result, undefined);
    assert.equal(resolveCache(false), undefined);
  });

  it('should create a cache with custom settings', () => {
    // GIVEN
    const options: { ttl: number; maxEntries: number } = { ttl: 60, maxEntries: 10.9 };

    // WHEN
    const result: ResponseCache | undefined = resolveCache(options);

    // THEN
    assert.equal(result?.ttl, 60);
    assert.equal(result?.maxEntries, 10);
  });
});

describe('createNpmClient cache', () => {
  const registry: () => FakeFetch = () =>
    fakeFetch((url) => (url.endsWith('/nope') ? jsonResponse({ error: 'Not found' }, { status: 404 }) : jsonResponse(packumentDocument('react'))));

  it('should not cache without the `cache` option', async () => {
    // GIVEN
    const fake: FakeFetch = registry();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch });

    // WHEN
    await client.getPackage('react');
    await client.getPackage('react');

    // THEN
    assert.equal(fake.calls.length, 2);
  });

  it('should reuse a response', async () => {
    // GIVEN
    const fake: FakeFetch = registry();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });

    // WHEN
    const first: unknown = await client.getPackage('react');
    const second: unknown = await client.getPackage('react');

    // THEN
    assert.equal(fake.calls.length, 1);
    assert.deepEqual(second, first);
  });

  it('should keep the full and the abbreviated documents apart', async () => {
    // GIVEN
    const fake: FakeFetch = registry();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });

    // WHEN
    await client.getPackage('react');
    await client.getAbbreviatedPackage('react');
    await client.getAbbreviatedPackage('react');

    // THEN
    assert.equal(fake.calls.length, 2);
  });

  it('should return copies (changing a result does not change the cache)', async () => {
    // GIVEN
    const fake: FakeFetch = registry();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });
    const first: { versions: Record<string, { dist: { tarball: string } }> } = await client.getPackage('react');
    first.versions['1.0.0']!.dist.tarball = 'changed';

    // WHEN
    const second: { versions: Record<string, { dist: { tarball: string } }> } = await client.getPackage('react');

    // THEN
    assert.notEqual(second.versions['1.0.0']?.dist.tarball, 'changed');
  });

  it('should never store errors', async () => {
    // GIVEN
    const fake: FakeFetch = registry();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });

    // WHEN
    await assert.rejects(client.getPackage('nope'), (error: unknown) => error instanceof NpmApiError && error.code === 'not-found');
    await assert.rejects(client.getPackage('nope'));

    // THEN
    assert.equal(fake.calls.length, 2);
  });

  it('should share identical requests made at the same time', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      return jsonResponse({ latest: '1.0.0' });
    });
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });

    // WHEN
    const results: string[] = await Promise.all([
      client.getLatestVersion('react'),
      client.getLatestVersion('react'),
      client.getDistTags('react').then((tags) => tags.latest),
    ]);

    // THEN
    assert.deepEqual(results, ['1.0.0', '1.0.0', '1.0.0']);
    assert.equal(fake.calls.length, 1);
  });

  it('should not fail a caller when another one sharing the request aborts', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(
      (_url) =>
        new Promise((resolve, reject) => {
          const signal: AbortSignal | undefined = fake.calls[fake.calls.length - 1]?.signal;
          const timer: ReturnType<typeof setTimeout> = setTimeout(() => resolve(jsonResponse({ latest: '1.0.0' })), 20);

          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason);
          });
        }),
    );
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });
    const controller: AbortController = new AbortController();

    // WHEN
    const aborted: Promise<string> = client.getLatestVersion('react', { signal: controller.signal });
    const other: Promise<string> = client.getLatestVersion('react');
    controller.abort();

    // THEN
    await assert.rejects(aborted, (error: unknown) => (error as Error).name === 'AbortError');
    assert.equal(await other, '1.0.0');
    assert.equal(fake.calls.length, 2);
  });

  it('should make a new request after `clearCache()`', async () => {
    // GIVEN
    const fake: FakeFetch = registry();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });
    await client.getPackage('react');

    // WHEN
    client.clearCache();
    await client.getPackage('react');

    // THEN
    assert.equal(fake.calls.length, 2);
  });

  it('should give each client its own cache', async () => {
    // GIVEN
    const fake: FakeFetch = registry();
    const first: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });
    const second: NpmClient = createNpmClient({ fetch: fake.fetch, cache: true });

    // WHEN
    await first.getPackage('react');
    await second.getPackage('react');
    first.clearCache();
    await second.getPackage('react');

    // THEN
    assert.equal(fake.calls.length, 2);
  });

  it('should keep the `cache` option in `defaults` and not send it down', async () => {
    // GIVEN
    const fake: FakeFetch = registry();
    const client: NpmClient = createNpmClient({ fetch: fake.fetch, cache: { ttl: 60 } });

    // WHEN
    await client.getPackage('react');

    // THEN
    assert.deepEqual(client.defaults.cache, { ttl: 60 });
    assert.ok(Object.isFrozen(client.defaults.cache));
  });

  it('should be a no-op `clearCache()` without `cache`', () => {
    // GIVEN
    const client: NpmClient = createNpmClient();

    // WHEN
    const run: () => void = () => client.clearCache();

    // THEN
    assert.doesNotThrow(run);
  });
});
