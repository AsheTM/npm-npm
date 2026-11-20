import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import { buildSearchText, searchPackages } from './search.ts';
import type { SearchQuery, SearchResult } from './search.types.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';

const hasCode: (code: string) => (error: unknown) => boolean = (code) => (error) => error instanceof NpmApiError && error.code === code;

const searchDocument: Record<string, unknown> = {
  objects: [
    {
      downloads: { monthly: 730, weekly: 391 },
      dependents: '6',
      updated: '2026-11-20T02:51:10.755Z',
      searchScore: 53.06,
      package: {
        name: '@ashetm/platform',
        keywords: ['ssr'],
        version: '1.0.1',
        description: 'Environment checks',
        publisher: { email: 'jane@example.com', username: 'ashetm' },
        maintainers: [{ email: 'jane@example.com', username: 'ashetm' }],
        license: 'MIT',
        date: '2026-11-13T02:46:04.943Z',
        links: { npm: 'https://www.npmjs.com/package/@ashetm/platform' },
      },
      score: { final: 53.06, detail: { popularity: 1, quality: 1, maintenance: 1 } },
      flags: { insecure: 0 },
    },
  ],
  total: 1,
  time: '2026-11-20T13:35:59.421Z',
};

// The `text` parameter of the requested URL
const textOf: (url: string | undefined) => string | null = (url) => new URL(url ?? '').searchParams.get('text');

describe('buildSearchText', () => {
  const cases: [string, string | SearchQuery, string][] = [
    ['a string', '  react   hooks ', 'react hooks'],
    ['text only', { text: 'react' }, 'react'],
    ['an author', { text: 'http', author: 'jane' }, 'http author:jane'],
    ['a maintainer', { maintainer: 'jane' }, 'maintainer:jane'],
    ['a scope without its `@`', { scope: '@angular' }, 'scope:angular'],
    ['a scope', { text: 'core', scope: 'angular' }, 'core scope:angular'],
    ['one keyword', { keywords: 'ssr' }, 'keywords:ssr'],
    ['several keywords', { keywords: ['ssr', ' platform ', ''] }, 'keywords:ssr,platform'],
    ['`not` and `is`', { text: 'x', not: 'insecure', is: 'unstable' }, 'x not:insecure is:unstable'],
    ['spaces inside a qualifier', { author: 'jane doe', keywords: ['web worker'] }, 'author:jane-doe keywords:web-worker'],
    [
      'every qualifier',
      { text: 'a', author: 'b', maintainer: 'c', scope: 'd', keywords: ['e', 'f'], not: 'unstable', is: 'insecure' },
      'a author:b maintainer:c scope:d keywords:e,f not:unstable is:insecure',
    ],
    ['an empty query', { text: ' ', keywords: [] }, ''],
  ];

  for (const [label, query, expected] of cases) {
    it(`should build ${label}`, () => {
      // GIVEN
      // `query`

      // WHEN
      const result: string = buildSearchText(query);

      // THEN
      assert.equal(result, expected);
    });
  }
});

describe('searchPackages', () => {
  it('should request the search endpoint and parse the result', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(searchDocument));

    // WHEN
    const result: SearchResult = await searchPackages('platform', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/-/v1/search?text=platform');
    assert.equal(result.total, 1);
    assert.equal(result.time, '2026-11-20T13:35:59.421Z');
    assert.equal(result.objects[0]?.package.name, '@ashetm/platform');
    assert.equal(result.objects[0]?.dependents, 6);
    assert.deepEqual(result.objects[0]?.downloads, { monthly: 730, weekly: 391 });
  });

  it('should send the qualifiers in `text`', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(searchDocument));

    // WHEN
    await searchPackages({ text: 'platform', author: 'ashetm', keywords: ['ssr', 'browser'] }, { fetch: fake.fetch });

    // THEN
    assert.equal(textOf(fake.calls[0]?.url), 'platform author:ashetm keywords:ssr,browser');
    assert.match(fake.calls[0]?.url ?? '', /text=platform\+author%3Aashetm\+keywords%3Assr%2Cbrowser$/);
  });

  it('should send `size` and `from`', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(searchDocument));

    // WHEN
    await searchPackages('react', { fetch: fake.fetch, size: 50, from: 100 });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/-/v1/search?text=react&size=50&from=100');
  });

  for (const [size, from, expectedSize, expectedFrom] of [
    [1000, -5, '250', '0'],
    [0, 2.7, '1', '2'],
  ] as const) {
    it(`should keep size ${size} and from ${from} in range`, async () => {
      // GIVEN
      const fake: FakeFetch = fakeFetch(() => jsonResponse(searchDocument));

      // WHEN
      await searchPackages('react', { fetch: fake.fetch, size, from });

      // THEN
      const params: URLSearchParams = new URL(fake.calls[0]?.url ?? '').searchParams;
      assert.equal(params.get('size'), expectedSize);
      assert.equal(params.get('from'), expectedFrom);
    });
  }

  it('should use a mirror registry', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(searchDocument));

    // WHEN
    await searchPackages('react', { fetch: fake.fetch, registry: 'https://registry.npmmirror.com/' });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmmirror.com/-/v1/search?text=react');
  });

  it('should throw `invalid-name` for an empty query without any request', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(searchDocument));

    // WHEN
    const promise: Promise<SearchResult> = searchPackages({ text: '  ' }, { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-name'));
    assert.equal(fake.calls.length, 0);
  });

  it('should drop a `dependents` value it cannot read', async () => {
    // GIVEN
    const objects: unknown[] = [{ ...(searchDocument['objects'] as Record<string, unknown>[])[0], dependents: 'many' }];
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ ...searchDocument, objects }));

    // WHEN
    const result: SearchResult = await searchPackages('react', { fetch: fake.fetch });

    // THEN
    assert.equal('dependents' in (result.objects[0] ?? {}), false);
  });

  for (const [label, body] of [
    ['no objects', { total: 0 }],
    ['an object without package', { objects: [{ score: {} }], total: 1 }],
  ] as const) {
    it(`should throw \`invalid-response\` with ${label}`, async () => {
      // GIVEN
      const fake: FakeFetch = fakeFetch(() => jsonResponse(body));

      // WHEN
      const promise: Promise<SearchResult> = searchPackages('react', { fetch: fake.fetch });

      // THEN
      await assert.rejects(promise, hasCode('invalid-response'));
    });
  }

  it('should throw `http` on a 400', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ error: "'text' query parameter is required" }, { status: 400 }));

    // WHEN
    const promise: Promise<SearchResult> = searchPackages('react', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('http'));
  });
});
