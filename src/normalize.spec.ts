import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import {
  normalizeAbbreviatedPackument,
  normalizeBugs,
  normalizeDistTags,
  normalizeLicense,
  normalizePackument,
  normalizeRepository,
  normalizeVersion,
} from './normalize.ts';
import type { AbbreviatedPackument, Bugs, PackageVersion, Packument, Repository } from './package.types.ts';
import { packumentDocument, versionDocument } from './testing/fixtures.ts';

const URL_: string = 'https://registry.npmjs.org/example';

const isInvalidResponse: (error: unknown) => boolean = (error) => error instanceof NpmApiError && error.code === 'invalid-response';

describe('normalizeRepository', () => {
  const cases: [string, unknown, Repository | undefined][] = [
    ['a string', 'github:example/repo', { type: 'git', url: 'github:example/repo' }],
    ['an object', { type: 'git', url: 'git+https://x.git', directory: 'packages/a' }, { type: 'git', url: 'git+https://x.git', directory: 'packages/a' }],
    ['an object without type', { url: 'https://x.git' }, { type: 'git', url: 'https://x.git' }],
    ['an object without url', { type: 'git' }, undefined],
    ['an empty string', '', undefined],
  ];

  for (const [label, value, expected] of cases) {
    it(`should normalize ${label}`, () => {
      // GIVEN
      // `value` from the registry

      // WHEN
      const result: Repository | undefined = normalizeRepository(value);

      // THEN
      assert.deepEqual(result, expected);
    });
  }
});

describe('normalizeBugs', () => {
  const cases: [string, unknown, Bugs | undefined][] = [
    ['a string', 'https://x/issues', { url: 'https://x/issues' }],
    ['an object', { url: 'https://x/issues', email: 'a@b.c' }, { url: 'https://x/issues', email: 'a@b.c' }],
    ['an empty object', {}, undefined],
    ['a number', 1, undefined],
  ];

  for (const [label, value, expected] of cases) {
    it(`should normalize ${label}`, () => {
      // GIVEN
      // `value` from the registry

      // WHEN
      const result: Bugs | undefined = normalizeBugs(value);

      // THEN
      assert.deepEqual(result, expected);
    });
  }
});

describe('normalizeLicense', () => {
  const cases: [string, unknown, string | undefined][] = [
    ['a string', 'MIT', 'MIT'],
    ['an old object', { type: 'BSD', url: 'https://x' }, 'BSD'],
    ['an array', ['MIT'], undefined],
  ];

  for (const [label, value, expected] of cases) {
    it(`should normalize ${label}`, () => {
      // GIVEN
      // `value` from the registry

      // WHEN
      const result: string | undefined = normalizeLicense(value);

      // THEN
      assert.equal(result, expected);
    });
  }
});

describe('normalizeDistTags', () => {
  it('should keep valid tags', () => {
    // GIVEN
    const raw: Record<string, unknown> = { latest: '1.0.0', next: '2.0.0' };

    // WHEN
    const result: Record<string, string> = normalizeDistTags(raw, URL_);

    // THEN
    assert.deepEqual(result, { latest: '1.0.0', next: '2.0.0' });
  });

  for (const raw of [{ next: '2.0.0' }, { latest: 1 }, { latest: '1.0.0', next: null }]) {
    it(`should throw \`invalid-response\` for ${JSON.stringify(raw)}`, () => {
      // GIVEN
      // dist-tags without a string `latest`, or with a non-string tag

      // WHEN
      const run: () => void = () => normalizeDistTags(raw, URL_);

      // THEN
      assert.throws(run, isInvalidResponse);
    });
  }
});

describe('normalizeVersion', () => {
  it('should normalize repository, license and deprecated', () => {
    // GIVEN
    const raw: Record<string, unknown> = versionDocument('example', '1.0.0', {
      repository: 'github:example/repo',
      license: { type: 'MIT' },
      deprecated: false,
    });

    // WHEN
    const result: PackageVersion = normalizeVersion(raw, URL_);

    // THEN
    assert.deepEqual(result.repository, { type: 'git', url: 'github:example/repo' });
    assert.equal(result.license, 'MIT');
    assert.equal('deprecated' in result, false);
    assert.equal(result.dist.tarball, 'https://registry.npmjs.org/example/-/example-1.0.0.tgz');
  });

  it('should keep a deprecation message', () => {
    // GIVEN
    const raw: Record<string, unknown> = versionDocument('example', '1.0.0', { deprecated: 'Use v2' });

    // WHEN
    const result: PackageVersion = normalizeVersion(raw, URL_);

    // THEN
    assert.equal(result.deprecated, 'Use v2');
  });

  it('should throw `invalid-response` without `dist`', () => {
    // GIVEN
    const raw: Record<string, unknown> = { name: 'example', version: '1.0.0' };

    // WHEN
    const run: () => void = () => normalizeVersion(raw, URL_);

    // THEN
    assert.throws(run, isInvalidResponse);
  });
});

describe('normalizePackument', () => {
  it('should keep a well-formed document', () => {
    // GIVEN
    const raw: Record<string, unknown> = packumentDocument('example');

    // WHEN
    const result: Packument = normalizePackument(raw, URL_);

    // THEN
    assert.equal(result.name, 'example');
    assert.equal(result['dist-tags'].latest, '1.1.0');
    assert.deepEqual(Object.keys(result.versions), ['1.0.0', '1.1.0', '2.0.0-rc.0']);
    assert.equal(result.time.created, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(result.maintainers, [{ name: 'jane', email: 'jane@example.com' }]);
    assert.deepEqual(result.author, { name: 'Jane Doe', email: 'jane@example.com', url: 'https://example.com' });
  });

  it('should normalize strings from old packages', () => {
    // GIVEN
    const raw: Record<string, unknown> = packumentDocument('example', {
      author: 'Jane Doe <jane@example.com>',
      maintainers: ['jane <jane@example.com>'],
      repository: 'example/repo',
      bugs: 'https://example.com/issues',
      license: { type: 'MIT' },
    });

    // WHEN
    const result: Packument = normalizePackument(raw, URL_);

    // THEN
    assert.deepEqual(result.author, { name: 'Jane Doe', email: 'jane@example.com' });
    assert.deepEqual(result.maintainers, [{ name: 'jane', email: 'jane@example.com' }]);
    assert.deepEqual(result.repository, { type: 'git', url: 'example/repo' });
    assert.deepEqual(result.bugs, { url: 'https://example.com/issues' });
    assert.equal(result.license, 'MIT');
  });

  it('should drop an author it cannot read', () => {
    // GIVEN
    const raw: Record<string, unknown> = packumentDocument('example', { author: 42 });

    // WHEN
    const result: Packument = normalizePackument(raw, URL_);

    // THEN
    assert.equal('author' in result, false);
  });

  it('should default missing `time` and `maintainers`', () => {
    // GIVEN
    const raw: Record<string, unknown> = packumentDocument('example');
    delete raw['time'];
    delete raw['maintainers'];

    // WHEN
    const result: Packument = normalizePackument(raw, URL_);

    // THEN
    assert.deepEqual(result.time, {});
    assert.deepEqual(result.maintainers, []);
  });

  for (const [label, extra] of [
    ['no name', { name: undefined }],
    ['no dist-tags', { 'dist-tags': undefined }],
    ['no versions', { versions: undefined }],
    ['a broken version', { versions: { '1.0.0': { name: 'example' } } }],
  ] as const) {
    it(`should throw \`invalid-response\` with ${label}`, () => {
      // GIVEN
      const raw: Record<string, unknown> = packumentDocument('example', extra);

      // WHEN
      const run: () => void = () => normalizePackument(raw, URL_);

      // THEN
      assert.throws(run, isInvalidResponse);
    });
  }
});

describe('normalizeAbbreviatedPackument', () => {
  it('should keep an abbreviated document', () => {
    // GIVEN
    const raw: Record<string, unknown> = {
      name: 'example',
      modified: '2026-03-01T00:00:00.000Z',
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': versionDocument('example', '1.0.0', { deprecated: 'old' }) },
    };

    // WHEN
    const result: AbbreviatedPackument = normalizeAbbreviatedPackument(raw, URL_);

    // THEN
    assert.equal(result.modified, '2026-03-01T00:00:00.000Z');
    assert.equal(result.versions['1.0.0']?.deprecated, 'old');
  });

  it('should read `modified` from `time` when a mirror sends the full document', () => {
    // GIVEN
    const raw: Record<string, unknown> = packumentDocument('example');

    // WHEN
    const result: AbbreviatedPackument = normalizeAbbreviatedPackument(raw, URL_);

    // THEN
    assert.equal(result.modified, '2026-03-01T00:00:00.000Z');
  });

  it('should throw `invalid-response` without dist-tags', () => {
    // GIVEN
    const raw: Record<string, unknown> = { name: 'example', versions: {} };

    // WHEN
    const run: () => void = () => normalizeAbbreviatedPackument(raw, URL_);

    // THEN
    assert.throws(run, isInvalidResponse);
  });
});
