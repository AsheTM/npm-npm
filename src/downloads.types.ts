// A day, `YYYY-MM-DD` (UTC)
export type DownloadDate = `${number}-${number}-${number}`;

// The named periods the downloads API accepts
export type NamedDownloadPeriod = 'last-day' | 'last-week' | 'last-month' | 'last-year';

// A named period, one day, or a range of days (`YYYY-MM-DD:YYYY-MM-DD`, at most 18 months)
export type DownloadPeriod = NamedDownloadPeriod | DownloadDate | `${DownloadDate}:${DownloadDate}`;

// Total downloads over a period
export interface DownloadsPoint {
  downloads: number;
  start: string;
  end: string;
  package: string;
}

export interface DailyDownloads {
  day: string;
  downloads: number;
}

// Downloads per day over a period
export interface DownloadsRange {
  downloads: DailyDownloads[];
  start: string;
  end: string;
  package: string;
}
