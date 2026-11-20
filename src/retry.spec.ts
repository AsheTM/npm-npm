import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import { DEFAULT_RETRY, requestJson, resolveRetry } from './request.ts';
import { fakeFetch, jsonResponse } from './testing/fetch.ts';
import type { FakeFetch } from './testing/fetch.ts';

const URL_: string = 'https://registry.npmjs.org/react';

// Answers 429 (with `retryAfter` seconds, if given) `times` times, then 200
const rateLimitedFetch: (times: number, retryAfter?: string) => FakeFetch = (times, retryAfter) => {
  let count: number = 0;

  return fakeFetch(() =>
    count++ < times
      ? jsonResponse({}, { status: 429, ...(retryAfter === undefined ? {} : { headers: { 'retry-after': retryAfter } }) })
      : jsonResponse({ name: 'react' }),
  );
};

const isRateLimited: (error: unknown) => boolean = (error) => error instanceof NpmApiError && error.code === 'rate-limited';

describe('resolveRetry', () => {
  it('should be off by default', () => {
    // GIVEN
    // no `retry` option

    // WHEN
    const result: unknown = resolveRetry(undefined);

    // THEN
    assert.equal(result, undefined);
    assert.equal(resolveRetry(false), undefined);
  });

  it('should use the defaults with `true`', () => {
    // GIVEN
    const retry: boolean = true;

    // WHEN
    const result: unknown = resolveRetry(retry);

    // THEN
    assert.deepEqual(result, DEFAULT_RETRY);
    assert.deepEqual(DEFAULT_RETRY, { attempts: 2, delay: 1, maxDelay: 60 });
  });

  it('should merge and clean custom settings', () => {
    // GIVEN
    const retry: { attempts: number; delay: number } = { attempts: 3.7, delay: -1 };

    // WHEN
    const result: unknown = resolveRetry(retry);

    // THEN
    assert.deepEqual(result, { attempts: 3, delay: 0, maxDelay: 60 });
  });
});

describe('requestJson retry', () => {
  it('should not retry by default', async () => {
    // GIVEN
    const fake: FakeFetch = rateLimitedFetch(1, '0');

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch });

    // THEN
    await assert.rejects(promise, isRateLimited);
    assert.equal(fake.calls.length, 1);
  });

  it('should retry after `Retry-After` and succeed', async () => {
    // GIVEN
    const fake: FakeFetch = rateLimitedFetch(2, '0');

    // WHEN
    const result: { name: string } = await requestJson(URL_, { fetch: fake.fetch, retry: true });

    // THEN
    assert.deepEqual(result, { name: 'react' });
    assert.equal(fake.calls.length, 3);
  });

  it('should wait the increasing delay without `Retry-After`', async () => {
    // GIVEN
    const fake: FakeFetch = rateLimitedFetch(2);
    const start: number = Date.now();

    // WHEN
    await requestJson(URL_, { fetch: fake.fetch, retry: { delay: 0.02 } });

    // THEN
    // 0.02 s, then 0.04 s
    assert.ok(Date.now() - start >= 55);
    assert.equal(fake.calls.length, 3);
  });

  it('should throw `rate-limited` when the attempts run out', async () => {
    // GIVEN
    const fake: FakeFetch = rateLimitedFetch(5, '0');

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch, retry: { attempts: 2 } });

    // THEN
    await assert.rejects(promise, isRateLimited);
    assert.equal(fake.calls.length, 3);
  });

  it('should not wait longer than `maxDelay`', async () => {
    // GIVEN
    const fake: FakeFetch = rateLimitedFetch(1, '120');

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch, retry: { maxDelay: 30 } });

    // THEN
    await assert.rejects(promise, (error: unknown) => isRateLimited(error) && (error as NpmApiError).retryAfter === 120);
    assert.equal(fake.calls.length, 1);
  });

  it('should not retry other errors', async () => {
    // GIVEN
    const fake: FakeFetch = fakeFetch(() => jsonResponse({}, { status: 503 }));

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch, retry: true });

    // THEN
    await assert.rejects(promise, (error: unknown) => error instanceof NpmApiError && error.code === 'http');
    assert.equal(fake.calls.length, 1);
  });

  it('should stop waiting when aborted', async () => {
    // GIVEN
    const controller: AbortController = new AbortController();
    const fake: FakeFetch = rateLimitedFetch(1, '30');
    const start: number = Date.now();

    // WHEN
    const promise: Promise<object> = requestJson(URL_, { fetch: fake.fetch, signal: controller.signal, retry: true });
    setTimeout(() => controller.abort(), 10);

    // THEN
    await assert.rejects(promise, (error: unknown) => (error as Error).name === 'AbortError');
    assert.ok(Date.now() - start < 1000);
    assert.equal(fake.calls.length, 1);
  });
});
