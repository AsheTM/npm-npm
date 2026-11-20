import type { DownloadPeriod, DownloadsPoint, DownloadsRange } from './downloads.types.ts';
import { NpmApiError } from './error.ts';
import { assertPackageName, encodeDownloadsName } from './name.ts';
import { isObject } from './normalize.ts';
import type { NpmApiOptions } from './options.ts';
import { getDownloadsApiUrl } from './options.ts';
import { requestJson } from './request.ts';

const NAMED_PERIODS: readonly string[] = ['last-day', 'last-week', 'last-month', 'last-year'];

const DATE_PERIOD: RegExp = /^\d{4}-\d{2}-\d{2}(?::\d{4}-\d{2}-\d{2})?$/;

export const isDownloadPeriod: (period: unknown) => period is DownloadPeriod = (period): period is DownloadPeriod =>
  typeof period === 'string' && (NAMED_PERIODS.includes(period) || DATE_PERIOD.test(period));

const assertDownloadPeriod: (period: DownloadPeriod) => void = (period) => {
  if (!isDownloadPeriod(period)) {
    throw new NpmApiError(`Invalid download period: ${JSON.stringify(period)}`, { code: 'invalid-name', url: '' });
  }
};

const downloadsUrl: (kind: 'point' | 'range', name: string, period: DownloadPeriod, options?: NpmApiOptions) => string = (
  kind,
  name,
  period,
  options,
) => {
  assertPackageName(name);
  assertDownloadPeriod(period);

  return `${getDownloadsApiUrl(options)}/${kind}/${period}/${encodeDownloadsName(name)}`;
};

const invalid: (url: string) => NpmApiError = (url) =>
  new NpmApiError(`Unexpected response from ${url}: downloads`, { code: 'invalid-response', url });

const hasPeriod: (raw: Record<string, unknown>) => boolean = (raw) =>
  typeof raw['start'] === 'string' && typeof raw['end'] === 'string' && typeof raw['package'] === 'string';

const isDownloadsPoint: (raw: unknown) => raw is DownloadsPoint = (raw): raw is DownloadsPoint =>
  isObject(raw) && hasPeriod(raw) && typeof raw['downloads'] === 'number';

// Total downloads of a package over a period (default: the last 7 days)
export const getDownloads: (name: string, period?: DownloadPeriod, options?: NpmApiOptions) => Promise<DownloadsPoint> = async (
  name,
  period = 'last-week',
  options,
) => {
  const url: string = downloadsUrl('point', name, period, options);
  const raw: Record<string, unknown> = await requestJson(url, options);

  if (!isDownloadsPoint(raw)) {
    throw invalid(url);
  }

  return raw;
};

// Downloads of a package per day over a period (default: the last 7 days)
export const getDownloadsRange: (name: string, period?: DownloadPeriod, options?: NpmApiOptions) => Promise<DownloadsRange> = async (
  name,
  period = 'last-week',
  options,
) => {
  const url: string = downloadsUrl('range', name, period, options);
  const raw: Record<string, unknown> = await requestJson(url, options);
  const days: unknown = raw['downloads'];

  if (
    !hasPeriod(raw) ||
    !Array.isArray(days) ||
    !days.every((day) => isObject(day) && typeof day['day'] === 'string' && typeof day['downloads'] === 'number')
  ) {
    throw invalid(url);
  }

  return raw as unknown as DownloadsRange;
};

// npm's limit of names per bulk request
export const MAX_BULK_SIZE: number = 128;

// Requests sent at the same time by `getDownloadsBulk`
const BULK_CONCURRENCY: number = 4;

const notFoundAsNull: <T>(promise: Promise<T>) => Promise<T | null> = (promise) =>
  promise.catch((error: unknown) => {
    if (error instanceof NpmApiError && error.code === 'not-found') {
      return null;
    }

    throw error;
  });

// Runs `tasks` with at most `limit` at a time; stops at the first error
const runLimited: (tasks: (() => Promise<void>)[], limit: number) => Promise<void> = async (tasks, limit) => {
  let next: number = 0;

  const worker: () => Promise<void> = async () => {
    while (next < tasks.length) {
      const task: () => Promise<void> = tasks[next++]!;

      await task();
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
};

// Total downloads of many packages over a period (default: the last 7 days; at most 365 days); `null` for an unknown package.
// Unscoped names go in batches of 128 per request; npm doesn't allow scoped names in bulk, so each one is a request.
export const getDownloadsBulk: (
  names: readonly string[],
  period?: DownloadPeriod,
  options?: NpmApiOptions,
) => Promise<Record<string, DownloadsPoint | null>> = async (names, period = 'last-week', options) => {
  const unique: string[] = [...new Set(names)];

  unique.forEach(assertPackageName);
  assertDownloadPeriod(period);

  const results: Map<string, DownloadsPoint | null> = new Map();
  const unscoped: string[] = unique.filter((name) => !name.startsWith('@'));
  const tasks: (() => Promise<void>)[] = unique
    .filter((name) => name.startsWith('@'))
    .map((name) => async () => {
      results.set(name, await notFoundAsNull(getDownloads(name, period, options)));
    });

  for (let index: number = 0; index < unscoped.length; index += MAX_BULK_SIZE) {
    const batch: string[] = unscoped.slice(index, index + MAX_BULK_SIZE);

    tasks.push(async () => {
      // With one name, npm answers like `getDownloads`
      if (batch.length === 1) {
        results.set(batch[0]!, await notFoundAsNull(getDownloads(batch[0]!, period, options)));

        return;
      }

      const url: string = `${getDownloadsApiUrl(options)}/point/${period}/${batch.map(encodeDownloadsName).join(',')}`;
      const raw: Record<string, unknown> = await requestJson(url, options);

      for (const name of batch) {
        const point: unknown = raw[name];

        if (point !== null && point !== undefined && !isDownloadsPoint(point)) {
          throw invalid(url);
        }

        results.set(name, point ?? null);
      }
    });
  }

  await runLimited(tasks, BULK_CONCURRENCY);

  return Object.fromEntries(unique.map((name) => [name, results.get(name) ?? null]));
};
