import type { DownloadDate } from './downloads.types.ts';

const pad: (value: number, length: number) => string = (value, length) => String(value).padStart(length, '0');

const assertValidDate: (date: Date, label: string) => void = (date, label) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid ${label} date`);
  }
};

// `Date` → `YYYY-MM-DD` (UTC, like the downloads API)
export const toDownloadDate: (date: Date) => DownloadDate = (date) => {
  assertValidDate(date, 'download');

  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}` as DownloadDate;
};

// `start` → `end` (default: `start`) as a `YYYY-MM-DD:YYYY-MM-DD` period (UTC); throws a `RangeError` if `start` is after `end`
export const toDownloadPeriod: (start: Date, end?: Date) => `${DownloadDate}:${DownloadDate}` = (start, end = start) => {
  assertValidDate(start, 'start');
  assertValidDate(end, 'end');

  const from: DownloadDate = toDownloadDate(start);
  const to: DownloadDate = toDownloadDate(end);

  if (from > to) {
    throw new RangeError(`The start date (${from}) is after the end date (${to})`);
  }

  return `${from}:${to}`;
};
