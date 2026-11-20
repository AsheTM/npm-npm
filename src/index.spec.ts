import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as api from './index.ts';

describe('index', () => {
  it('should export the public API only', () => {
    // GIVEN
    const expected: string[] = [
      'DEFAULT_DOWNLOADS_API',
      'DEFAULT_REGISTRY',
      'MAX_SEARCH_SIZE',
      'NpmApiError',
      'createNpmClient',
      'getAbbreviatedPackage',
      'getDistTags',
      'getDownloads',
      'getDownloadsRange',
      'getLatestVersion',
      'getPackage',
      'getVersion',
      'isDownloadPeriod',
      'isValidPackageName',
      'searchPackages',
    ];

    // WHEN
    const result: string[] = Object.keys(api).sort();

    // THEN
    assert.deepEqual(result, expected);
  });
});
