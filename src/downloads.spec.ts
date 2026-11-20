import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getDownloads, getDownloadsBulk, getDownloadsRange, isDownloadPeriod } from './downloads.ts';
import type { DownloadPeriod, DownloadsPoint, DownloadsRange } from './downloads.types.ts';
import { NpmApiError } from './error.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';

const hasCode: (code: string) => (error: unknown) => boolean = (code) => (error) => error instanceof NpmApiError && error.code === code;

const pointDocument: (name: string) => DownloadsPoint = (name) => ({ downloads: 1234, start: '2026-11-13', end: '2026-11-19', package: name });

const rangeDocument: (name: string) => DownloadsRange = (name) => ({
  start: '2026-11-18',
  end: '2026-11-19',
  package: name,
  downloads: [
    { day: '2026-11-18', downloads: 10 },
    { day: '2026-11-19', downloads: 20 },
  ],
});

describe('isDownloadPeriod', () => {
  for (const period of ['last-day', 'last-week', 'last-month', 'last-year', '2026-01-07', '2026-01-01:2026-01-07']) {
    it(`should accept ${period}`, () => {
      // GIVEN
      // a period the downloads API accepts

      // WHEN
      const result: boolean = isDownloadPeriod(period);

      // THEN
      assert.equal(result, true);
    });
  }

  for (const period of ['last-quarter', '', '2026-1-7', '2026-01-01:', '../x', 7]) {
    it(`should reject ${JSON.stringify(period)}`, () => {
      // GIVEN
      // a period the downloads API rejects

      // WHEN
      const result: boolean = isDownloadPeriod(period);

      // THEN
      assert.equal(result, false);
    });
  }
});

describe('getDownloads', () => {
  it('should request the last week by default', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(pointDocument('react')));

    // WHEN
    const result: DownloadsPoint = await getDownloads('react', undefined, { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://api.npmjs.org/downloads/point/last-week/react');
    assert.deepEqual(result, pointDocument('react'));
  });

  it('should keep a scoped name as is', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(pointDocument('@angular/core')));

    // WHEN
    await getDownloads('@angular/core', 'last-month', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://api.npmjs.org/downloads/point/last-month/@angular/core');
  });

  it('should request a date range', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(pointDocument('react')));

    // WHEN
    await getDownloads('react', '2026-01-01:2026-01-07', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://api.npmjs.org/downloads/point/2026-01-01:2026-01-07/react');
  });

  it('should use a custom downloads API', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(pointDocument('react')));

    // WHEN
    await getDownloads('react', 'last-day', { fetch: fake.fetch, downloadsApi: 'https://example.com/downloads/' });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://example.com/downloads/point/last-day/react');
  });

  it('should throw `invalid-name` for a bad period without any request', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(pointDocument('react')));

    // WHEN
    const promise: Promise<DownloadsPoint> = getDownloads('react', 'last-quarter' as DownloadPeriod, { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-name'));
    assert.equal(fake.calls.length, 0);
  });

  it('should throw `invalid-name` for a bad package name without any request', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(pointDocument('react')));

    // WHEN
    const promise: Promise<DownloadsPoint> = getDownloads('../x', 'last-day', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-name'));
    assert.equal(fake.calls.length, 0);
  });

  it('should throw `not-found` for an unknown package', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ error: 'package nope not found' }, { status: 404 }));

    // WHEN
    const promise: Promise<DownloadsPoint> = getDownloads('nope', 'last-day', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('not-found'));
  });

  it('should throw `http` when the API rejects the dates', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ error: 'end date > start date' }, { status: 400 }));

    // WHEN
    const promise: Promise<DownloadsPoint> = getDownloads('react', '2030-01-02:2030-01-01', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('http'));
  });

  it('should throw `invalid-response` without a downloads count', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ start: 'a', end: 'b', package: 'react' }));

    // WHEN
    const promise: Promise<DownloadsPoint> = getDownloads('react', 'last-day', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-response'));
  });
});

describe('getDownloadsRange', () => {
  it('should request the range endpoint of a scoped package', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(rangeDocument('@ashetm/platform')));

    // WHEN
    const result: DownloadsRange = await getDownloadsRange('@ashetm/platform', '2026-11-18:2026-11-19', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://api.npmjs.org/downloads/range/2026-11-18:2026-11-19/@ashetm/platform');
    assert.deepEqual(result.downloads, rangeDocument('@ashetm/platform').downloads);
  });

  it('should request the last week by default', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse(rangeDocument('react')));

    // WHEN
    await getDownloadsRange('react', undefined, { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]?.url, 'https://api.npmjs.org/downloads/range/last-week/react');
  });

  it('should throw `invalid-response` with a broken day', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ ...rangeDocument('react'), downloads: [{ day: '2026-11-18' }] }));

    // WHEN
    const promise: Promise<DownloadsRange> = getDownloadsRange('react', 'last-week', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-response'));
  });
});

describe('getDownloadsBulk', () => {
  // Answers bulk URLs with a map (unknown names → null, `nope*` names), single names like `getDownloads`
  const bulkFetch: () => FakeFetch = () =>
    fakeFetch((url) => {
      const names: string[] = url.split('/').slice(6).join('/').split(',');

      if (names.length === 1) {
        return names[0]!.startsWith('nope') || names[0]!.startsWith('@nope')
          ? jsonResponse({ error: 'not found' }, { status: 404 })
          : jsonResponse(pointDocument(names[0]!));
      }

      return jsonResponse(Object.fromEntries(names.map((name) => [name, name.startsWith('nope') ? null : pointDocument(name)])));
    });

  it('should get unscoped names in one request', async () => {
    // GIVEN
    const fake: FakeFetch = bulkFetch();

    // WHEN
    const result: Record<string, DownloadsPoint | null> = await getDownloadsBulk(['react', 'vue', 'nope'], 'last-month', {
      fetch: fake.fetch,
    });

    // THEN
    assert.deepEqual(
      fake.calls.map((call) => call.url),
      ['https://api.npmjs.org/downloads/point/last-month/react,vue,nope'],
    );
    assert.deepEqual(result, { react: pointDocument('react'), vue: pointDocument('vue'), nope: null });
  });

  it('should send one request per scoped name and keep the input order', async () => {
    // GIVEN
    const fake: FakeFetch = bulkFetch();

    // WHEN
    const result: Record<string, DownloadsPoint | null> = await getDownloadsBulk(['@angular/core', 'react', '@nope/x', 'vue'], undefined, {
      fetch: fake.fetch,
    });

    // THEN
    assert.deepEqual(fake.calls.map((call) => call.url).sort(), [
      'https://api.npmjs.org/downloads/point/last-week/@angular/core',
      'https://api.npmjs.org/downloads/point/last-week/@nope/x',
      'https://api.npmjs.org/downloads/point/last-week/react,vue',
    ]);
    assert.deepEqual(Object.keys(result), ['@angular/core', 'react', '@nope/x', 'vue']);
    assert.equal(result['@nope/x'], null);
    assert.deepEqual(result['@angular/core'], pointDocument('@angular/core'));
  });

  it('should split unscoped names in batches of 128', async () => {
    // GIVEN
    const fake: FakeFetch = bulkFetch();
    const names: string[] = Array.from({ length: 300 }, (_, index) => `pkg-${index}`);

    // WHEN
    const result: Record<string, DownloadsPoint | null> = await getDownloadsBulk(names, 'last-day', { fetch: fake.fetch });

    // THEN
    assert.deepEqual(
      fake.calls.map((call) => call.url.split('/').pop()!.split(',').length),
      [128, 128, 44],
    );
    assert.equal(Object.keys(result).length, 300);
  });

  it('should ask a single unscoped name like `getDownloads` (npm answers without a map)', async () => {
    // GIVEN
    const fake: FakeFetch = bulkFetch();

    // WHEN
    const result: Record<string, DownloadsPoint | null> = await getDownloadsBulk(['react', 'react'], 'last-day', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls.length, 1);
    assert.deepEqual(result, { react: pointDocument('react') });
  });

  it('should return an empty object without any request', async () => {
    // GIVEN
    const fake: FakeFetch = bulkFetch();

    // WHEN
    const result: Record<string, DownloadsPoint | null> = await getDownloadsBulk([], 'last-day', { fetch: fake.fetch });

    // THEN
    assert.deepEqual(result, {});
    assert.equal(fake.calls.length, 0);
  });

  it('should throw `invalid-name` for one bad name without any request', async () => {
    // GIVEN
    const fake: FakeFetch = bulkFetch();

    // WHEN
    const promise: Promise<Record<string, DownloadsPoint | null>> = getDownloadsBulk(['react', '../x'], 'last-day', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-name'));
    assert.equal(fake.calls.length, 0);
  });

  it('should reject on an error other than `not-found`', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ error: 'exceeded max days of 365 for bulk query' }, { status: 400 }));

    // WHEN
    const promise: Promise<Record<string, DownloadsPoint | null>> = getDownloadsBulk(['react', 'vue'], '2025-01-01:2026-11-01', {
      fetch: fake.fetch,
    });

    // THEN
    await assert.rejects(promise, hasCode('http'));
  });

  it('should throw `invalid-response` for a broken entry', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ react: { downloads: 'many' }, vue: null }));

    // WHEN
    const promise: Promise<Record<string, DownloadsPoint | null>> = getDownloadsBulk(['react', 'vue'], 'last-day', { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, hasCode('invalid-response'));
  });

  it('should send at most 4 requests at a time', async () => {
    // GIVEN
    let running: number = 0;
    let maxRunning: number = 0;
    const fake: FakeFetch = fakeFetch(async (url) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;

      return jsonResponse(pointDocument(url.split('/').slice(6).join('/')));
    });
    const names: string[] = Array.from({ length: 10 }, (_, index) => `@scope/pkg-${index}`);

    // WHEN
    await getDownloadsBulk(names, 'last-day', { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls.length, 10);
    assert.equal(maxRunning, 4);
  });
});
