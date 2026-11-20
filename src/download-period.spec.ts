import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toDownloadDate, toDownloadPeriod } from './download-period.ts';

describe('toDownloadDate', () => {
  it('should format a date as YYYY-MM-DD', () => {
    // GIVEN
    const date: Date = new Date(Date.UTC(2026, 0, 7, 12));

    // WHEN
    const result: string = toDownloadDate(date);

    // THEN
    assert.equal(result, '2026-01-07');
  });

  it('should use UTC', () => {
    // GIVEN
    // 23:30 on Dec 31 at UTC-2 is already Jan 1 in UTC
    const date: Date = new Date('2025-12-31T23:30:00-02:00');

    // WHEN
    const result: string = toDownloadDate(date);

    // THEN
    assert.equal(result, '2026-01-01');
  });

  it('should throw a `RangeError` for an invalid date', () => {
    // GIVEN
    const date: Date = new Date('nope');

    // WHEN
    const run: () => void = () => toDownloadDate(date);

    // THEN
    assert.throws(run, RangeError);
  });
});

describe('toDownloadPeriod', () => {
  it('should format a range', () => {
    // GIVEN
    const start: Date = new Date(Date.UTC(2026, 0, 1));
    const end: Date = new Date(Date.UTC(2026, 0, 31, 23, 59));

    // WHEN
    const result: string = toDownloadPeriod(start, end);

    // THEN
    assert.equal(result, '2026-01-01:2026-01-31');
  });

  it('should default the end to the start (one day)', () => {
    // GIVEN
    const start: Date = new Date(Date.UTC(2026, 10, 19));

    // WHEN
    const result: string = toDownloadPeriod(start);

    // THEN
    assert.equal(result, '2026-11-19:2026-11-19');
  });

  it('should accept two times on the same UTC day in any order', () => {
    // GIVEN
    const start: Date = new Date(Date.UTC(2026, 10, 19, 20));
    const end: Date = new Date(Date.UTC(2026, 10, 19, 8));

    // WHEN
    const result: string = toDownloadPeriod(start, end);

    // THEN
    assert.equal(result, '2026-11-19:2026-11-19');
  });

  it('should throw a `RangeError` when the start is after the end', () => {
    // GIVEN
    const start: Date = new Date(Date.UTC(2026, 1, 1));
    const end: Date = new Date(Date.UTC(2026, 0, 1));

    // WHEN
    const run: () => void = () => toDownloadPeriod(start, end);

    // THEN
    assert.throws(run, RangeError);
  });

  it('should throw a `RangeError` for an invalid end date', () => {
    // GIVEN
    const start: Date = new Date(Date.UTC(2026, 0, 1));
    const end: Date = new Date(Number.NaN);

    // WHEN
    const run: () => void = () => toDownloadPeriod(start, end);

    // THEN
    assert.throws(run, RangeError);
  });
});
