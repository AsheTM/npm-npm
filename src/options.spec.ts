import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_DOWNLOADS_API, DEFAULT_REGISTRY, getDownloadsApiUrl, getRegistryUrl } from './options.ts';

describe('getRegistryUrl', () => {
  it('should default to the public registry', () => {
    // GIVEN
    // no options

    // WHEN
    const result: string = getRegistryUrl();

    // THEN
    assert.equal(result, DEFAULT_REGISTRY);
    assert.equal(result, 'https://registry.npmjs.org');
  });

  it('should use a mirror registry without its trailing slashes', () => {
    // GIVEN
    const registry: string = 'https://registry.npmmirror.com//';

    // WHEN
    const result: string = getRegistryUrl({ registry });

    // THEN
    assert.equal(result, 'https://registry.npmmirror.com');
  });
});

describe('getDownloadsApiUrl', () => {
  it('should default to the public downloads API', () => {
    // GIVEN
    // no options

    // WHEN
    const result: string = getDownloadsApiUrl();

    // THEN
    assert.equal(result, DEFAULT_DOWNLOADS_API);
    assert.equal(result, 'https://api.npmjs.org/downloads');
  });

  it('should use a custom downloads API without its trailing slash', () => {
    // GIVEN
    const downloadsApi: string = 'https://example.com/downloads/';

    // WHEN
    const result: string = getDownloadsApiUrl({ downloadsApi });

    // THEN
    assert.equal(result, 'https://example.com/downloads');
  });
});
