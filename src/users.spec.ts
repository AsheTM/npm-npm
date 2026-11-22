import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';
import { stubGlobal } from './testing/global.ts';
import { getUserPackages } from './users.ts';

const hasCode: (code: string) => (error: unknown) => boolean = (code) => (error) => error instanceof NpmApiError && error.code === code;

let restores: (() => void)[] = [];

afterEach(() => {
  restores.reverse().forEach((restore) => restore());
  restores = [];
});

const stubBrowser: () => void = () => {
  restores.push(stubGlobal('window', {}), stubGlobal('navigator', {}));
};

// A search object for `name`, maintained by `maintainers`
const searchObject: (name: string, maintainers: string[]) => Record<string, unknown> = (name, maintainers) => ({
  package: { name, version: '1.0.0', date: '', links: {}, maintainers: maintainers.map((username) => ({ username })) },
  score: { final: 1, detail: { popularity: 1, quality: 1, maintenance: 1 } },
  searchScore: 1,
});

describe('getUserPackages on the server', () => {
  it('should request the user endpoint and sort the names', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ vuegc: 'write', '@ashetm/types': 'write', '@ashetm/npm': 'read' }));

    // WHEN
    const result: string[] = await getUserPackages('ashetm', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmjs.org/-/user/ashetm/package');
    assert.deepEqual(result, ['@ashetm/npm', '@ashetm/types', 'vuegc']);
  });

  it('should use a mirror registry', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}));

    // WHEN
    const result: string[] = await getUserPackages('ashetm', { fetch: fake.fetch, registry: 'https://registry.npmmirror.com/' });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://registry.npmmirror.com/-/user/ashetm/package');
    assert.deepEqual(result, []);
  });

  it('should throw `not-found` for an unknown user', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ error: 'Scope not found' }, { status: 404 }));

    // WHEN
    const promise: Promise<string[]> = getUserPackages('nobody-zzq', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('not-found'));
  });

  it('should throw `invalid-response` for an unexpected list', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ react: 1 }));

    // WHEN
    const promise: Promise<string[]> = getUserPackages('ashetm', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-response'));
  });

  for (const username of ['', ' ashetm', 'a/b', 'a b', '../x']) {
    it(`should throw \`invalid-name\` for ${JSON.stringify(username)} without any request`, async () => {
      // GIVEN
      const fake: FakeFetch = fakeFetch(() => jsonResponse({}));

      // WHEN
      const promise: Promise<string[]> = getUserPackages(username, { fetch: fake.fetch });

      // THEN
      await assert.rejects(promise, hasCode('invalid-name'));
      assert.equal(fake.calls.length, 0);
    });
  }
});

describe('getUserPackages in a browser', () => {
  it('should use the search and keep only the packages of this maintainer', async () => {
    // GIVEN
    stubBrowser();
    const fake: FakeFetch = fakeFetch(() =>
      jsonResponse({
        objects: [searchObject('vuegc', ['ashetm']), searchObject('@ashetm/npm', ['ashetm', 'jane']), searchObject('other', ['jane'])],
        total: 3,
        time: '',
      }),
    );

    // WHEN
    const result: string[] = await getUserPackages('ashetm', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls.length, 1);
    assert.equal(new URL(fake.calls[0]!.url).searchParams.get('text'), 'maintainer:ashetm');
    assert.equal(new URL(fake.calls[0]!.url).searchParams.get('size'), '250');
    assert.deepEqual(result, ['@ashetm/npm', 'vuegc']);
  });

  it('should read every page of 250', async () => {
    // GIVEN
    stubBrowser();
    const all: Record<string, unknown>[] = Array.from({ length: 600 }, (_, index) => searchObject(`pkg-${index}`, ['jane']));
    const fake: FakeFetch = fakeFetch((url) => {
      const from: number = Number(new URL(url).searchParams.get('from'));

      return jsonResponse({ objects: all.slice(from, from + 250), total: 600, time: '' });
    });

    // WHEN
    const result: string[] = await getUserPackages('jane', { fetch: fake.fetch });

    // THEN
    assert.deepEqual(
      fake.calls.map((call) => new URL(call.url).searchParams.get('from')),
      ['0', '250', '500'],
    );
    assert.equal(result.length, 600);
  });

  it('should return an empty array for an unknown user', async () => {
    // GIVEN
    stubBrowser();
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ objects: [], total: 0, time: '' }));

    // WHEN
    const result: string[] = await getUserPackages('nobody-zzq', { fetch: fake.fetch });

    // THEN
    assert.deepEqual(result, []);
  });
});
