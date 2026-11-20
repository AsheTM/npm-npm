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

const downloadsUrl: (kind: 'point' | 'range', name: string, period: DownloadPeriod, options?: NpmApiOptions) => string = (
  kind,
  name,
  period,
  options,
) => {
  assertPackageName(name);

  if (!isDownloadPeriod(period)) {
    throw new NpmApiError(`Invalid download period: ${JSON.stringify(period)}`, { code: 'invalid-name', url: '' });
  }

  return `${getDownloadsApiUrl(options)}/${kind}/${period}/${encodeDownloadsName(name)}`;
};

const invalid: (url: string) => NpmApiError = (url) =>
  new NpmApiError(`Unexpected response from ${url}: downloads`, { code: 'invalid-response', url });

const hasPeriod: (raw: Record<string, unknown>) => boolean = (raw) =>
  typeof raw['start'] === 'string' && typeof raw['end'] === 'string' && typeof raw['package'] === 'string';

// Total downloads of a package over a period (default: the last 7 days)
export const getDownloads: (name: string, period?: DownloadPeriod, options?: NpmApiOptions) => Promise<DownloadsPoint> = async (
  name,
  period = 'last-week',
  options,
) => {
  const url: string = downloadsUrl('point', name, period, options);
  const raw: Record<string, unknown> = await requestJson(url, options);

  if (!hasPeriod(raw) || typeof raw['downloads'] !== 'number') {
    throw invalid(url);
  }

  return raw as unknown as DownloadsPoint;
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
