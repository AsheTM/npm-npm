import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import { parseRetryAfter, requestJson } from './request.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';
import { stubGlobal } from './testing/global.ts';

const URL_: string = 'https://registry.npmjs.org/react';

let restores: (() => void)[] = [];

afterEach(() => {
  restores.reverse().forEach((restore) => restore());
  restores = [];
});

const rejectsWith: (promise: Promise<unknown>, check: (error: NpmApiError) => void) => Promise<void> = async (promise, check) => {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof NpmApiError);
    check(error);

    return true;
  });
};

describe('requestJson', () => {
  it('should return the JSON body', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ name: 'react' }));

    // WHEN
    const result: { name: string } = await requestJson(URL_, { fetch: fake.fetch });

    // THEN
    assert.deepEqual(result, { name: 'react' });
    assert.equal(fake.calls[0]?.url, URL_);
  });

  it('should send `Accept`, a `User-Agent` on the server and the custom headers', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}));

    // WHEN
    await requestJson(URL_, { fetch: fake.fetch, headers: { authorization: 'Bearer x' } }, { accept: 'application/vnd.npm.install-v1+json' });

    // THEN
    const headers: Record<string, string> = fake.calls[0]!.headers;
    assert.equal(headers['accept'], 'application/vnd.npm.install-v1+json');
    assert.match(headers['user-agent'] ?? '', /^@ashetm\/npm/);
    assert.equal(headers['authorization'], 'Bearer x');
  });

  it('should not send a `User-Agent` in the browser', async () => {
    // GIVEN
    restores.push(stubGlobal('window', {}), stubGlobal('navigator', {}));
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}));

    // WHEN
    await requestJson(URL_, { fetch: fake.fetch });

    // THEN
    assert.equal(fake.calls[0]!.headers['user-agent'], undefined);
    assert.equal(fake.calls[0]!.headers['accept'], 'application/json');
  });

  it('should use the global `fetch` by default', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ ok: true }));
    restores.push(stubGlobal('fetch', fake.fetch));

    // WHEN
    const result: { ok: boolean } = await requestJson(URL_);

    // THEN
    assert.deepEqual(result, { ok: true });
    assert.equal(fake.calls.length, 1);
  });

  it('should throw a `network` error when no `fetch` is available', async () => {
    // GIVEN
    restores.push(stubGlobal('fetch', undefined));

    // WHEN
    const promise: Promise<object> = requestJson(URL_);

    // THEN
    await rejectsWith(promise, (error) => assert.equal(error.code, 'network'));
  });

  it('should pass the signal to `fetch`', async () => {
    // GIVEN
    const controller: AbortController = new AbortController();
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}));

    // WHEN
    await requestJson(URL_, { fetch: fake.fetch, signal: controller.signal });

    // THEN
    assert.equal(fake.calls[0]!.signal, controller.signal);
  });

  it('should rethrow an abort as is', async () => {
    // GIVEN
    const controller: AbortController = new AbortController();
    controller.abort();
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}));

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch, signal: controller.signal });

    // THEN
    await assert.rejects(promise, (error: unknown) => !(error instanceof NpmApiError) && (error as Error).name === 'AbortError');
  });

  it('should throw a `not-found` error on 404', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({ error: 'Not found' }, { status: 404 }));

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch });

    // THEN
    await rejectsWith(promise, (error) => {
      assert.equal(error.code, 'not-found');
      assert.equal(error.status, 404);
      assert.equal(error.url, URL_);
      assert.equal(error.name, 'NpmApiError');
    });
  });

  it('should throw a `rate-limited` error on 429 with `retryAfter`', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}, { status: 429, headers: { 'retry-after': '30' } }));

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch });

    // THEN
    await rejectsWith(promise, (error) => {
      assert.equal(error.code, 'rate-limited');
      assert.equal(error.status, 429);
      assert.equal(error.retryAfter, 30);
    });
  });

  it('should throw a `rate-limited` error on 429 without `retryAfter` when the header is missing', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}, { status: 429 }));

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch });

    // THEN
    await rejectsWith(promise, (error) => {
      assert.equal(error.code, 'rate-limited');
      assert.equal('retryAfter' in error, false);
    });
  });

  it('should throw an `http` error on other statuses', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => new Response('oops', { status: 503 }));

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch });

    // THEN
    await rejectsWith(promise, (error) => {
      assert.equal(error.code, 'http');
      assert.equal(error.status, 503);
    });
  });

  it('should throw a `network` error when `fetch` fails', async () => {
    // GIVEN
    const failure: TypeError = new TypeError('fetch failed');
    const fake: FakeFetch = fakeFetch(() => Promise.reject(failure));

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch });

    // THEN
    await rejectsWith(promise, (error) => {
      assert.equal(error.code, 'network');
      assert.equal(error.cause, failure);
      assert.equal(error.status, undefined);
    });
  });

  it('should throw an `invalid-response` error on invalid JSON', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => new Response('<html>', { status: 200 }));

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch });

    // THEN
    await rejectsWith(promise, (error) => {
      assert.equal(error.code, 'invalid-response');
      assert.equal(error.status, 200);
    });
  });

  for (const body of [null, 'text', 42, []]) {
    it(`should throw an \`invalid-response\` error when the JSON is ${JSON.stringify(body)}`, async () => {
      // GIVEN
      const fake: FakeFetch = fakeFetch(() => jsonResponse(body));

      // WHEN
      const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch });

      // THEN
      await rejectsWith(promise, (error) => assert.equal(error.code, 'invalid-response'));
    });
  }
});

describe('parseRetryAfter', () => {
  it('should read seconds', () => {
    // GIVEN
    const value: string = '120';

    // WHEN
    const result: number | undefined = parseRetryAfter(value);

    // THEN
    assert.equal(result, 120);
  });

  it('should read an HTTP date', () => {
    // GIVEN
    const now: number = Date.parse('Wed, 21 Oct 2026 07:28:00 GMT');
    const value: string = 'Wed, 21 Oct 2026 07:28:45 GMT';

    // WHEN
    const result: number | undefined = parseRetryAfter(value, now);

    // THEN
    assert.equal(result, 45);
  });

  it('should never return a negative delay', () => {
    // GIVEN
    const now: number = Date.parse('Wed, 21 Oct 2026 08:00:00 GMT');
    const value: string = 'Wed, 21 Oct 2026 07:28:45 GMT';

    // WHEN
    const result: number | undefined = parseRetryAfter(value, now);

    // THEN
    assert.equal(result, 0);
  });

  for (const value of [null, '', 'soon']) {
    it(`should return undefined for ${JSON.stringify(value)}`, () => {
      // GIVEN
      // a missing or unreadable header

      // WHEN
      const result: number | undefined = parseRetryAfter(value);

      // THEN
      assert.equal(result, undefined);
    });
  }
});
