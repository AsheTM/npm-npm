// Live tests against the real npm registry: `npm run test:live` (never part of `npm test` or `prepublishOnly`)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createNpmClient } from './client.ts';
import { getDownloads, getDownloadsRange } from './downloads.ts';
import type { DownloadsPoint, DownloadsRange } from './downloads.types.ts';
import type { NpmClient } from './client.ts';
import { NpmApiError } from './error.ts';
import type { AbbreviatedPackument, DistTags, PackageVersion, Packument } from './package.types.ts';
import { getAbbreviatedPackage, getDistTags, getLatestVersion, getPackage, getVersion } from './packages.ts';
import { searchPackages } from './search.ts';
import type { SearchResult } from './search.types.ts';

const SEMVER: RegExp = /^\d+\.\d+\.\d+/;

const hasCode: (code: string) => (error: unknown) => boolean = (code) => (error) => error instanceof NpmApiError && error.code === code;

describe('registry (live)', () => {
  it('should get a scoped package', async () => {
    // GIVEN
    const name: string = '@ashetm/platform';

    // WHEN
    const result: Packument = await getPackage(name);

    // THEN
    assert.equal(result.name, name);
    assert.match(result['dist-tags'].latest, SEMVER);
    assert.ok(result.versions['1.0.0']);
    assert.equal(result.author?.name, 'DAWOUD Haitham');
    assert.equal(result.repository?.url, 'git+https://github.com/AsheTM/npm-platform.git');
    assert.ok(result.time.created);
  });

  it('should normalize an old package (uppercase name, string fields)', async () => {
    // GIVEN
    const name: string = 'JSONStream';

    // WHEN
    const result: Packument = await getPackage(name);

    // THEN
    assert.equal(result.name, name);
    assert.equal(typeof result.author?.name, 'string');
    assert.equal(typeof result.repository?.url, 'string');
    assert.ok(result.maintainers.length > 0);
  });

  it('should get the abbreviated document', async () => {
    // GIVEN
    const name: string = 'request';

    // WHEN
    const result: AbbreviatedPackument = await getAbbreviatedPackage(name);

    // THEN
    assert.equal(result.name, name);
    assert.ok(result.modified);
    assert.match(result.versions[result['dist-tags'].latest]?.deprecated ?? '', /deprecated/);
    assert.equal('readme' in result, false);
  });

  it('should get a version by tag and by number', async () => {
    // GIVEN
    const name: string = '@angular/core';

    // WHEN
    const latest: PackageVersion = await getVersion(name, 'latest');
    const exact: PackageVersion = await getVersion(name, latest.version);

    // THEN
    assert.equal(latest.name, name);
    assert.equal(exact.version, latest.version);
    assert.ok(latest.peerDependencies?.['rxjs']);
    assert.match(latest.dist.tarball, /\.tgz$/);
  });

  it('should get the dist-tags and the latest version', async () => {
    // GIVEN
    const name: string = 'typescript';

    // WHEN
    const tags: DistTags = await getDistTags(name);
    const latest: string = await getLatestVersion(name);

    // THEN
    assert.equal(latest, tags.latest);
    assert.match(tags['next'] ?? '', SEMVER);
  });

  it('should throw `not-found` for an unknown package and version', async () => {
    // GIVEN
    const unknown: string = '@ashetm/this-package-does-not-exist';

    // WHEN
    const packagePromise: Promise<Packument> = getPackage(unknown);
    const versionPromise: Promise<PackageVersion> = getVersion('@ashetm/platform', '0.0.0-does-not-exist');

    // THEN
    await assert.rejects(packagePromise, hasCode('not-found'));
    await assert.rejects(versionPromise, hasCode('not-found'));
  });

  it('should search with qualifiers', async () => {
    // GIVEN
    const query: { text: string; author: string; keywords: string[] } = { text: 'platform', author: 'ashetm', keywords: ['ssr'] };

    // WHEN
    const result: SearchResult = await searchPackages(query, { size: 5 });

    // THEN
    assert.ok(result.total >= 1);
    assert.ok(result.objects.length <= 5);
    assert.ok(result.objects.some((object) => object.package.name === '@ashetm/platform'));
    assert.equal(typeof result.objects[0]?.dependents, 'number');
  });

  it('should get downloads of a scoped package', async () => {
    // GIVEN
    const name: string = '@angular/core';

    // WHEN
    const point: DownloadsPoint = await getDownloads(name, 'last-week');
    const range: DownloadsRange = await getDownloadsRange(name, 'last-week');

    // THEN
    assert.equal(point.package, name);
    assert.ok(point.downloads > 0);
    assert.equal(range.downloads.length, 7);
    assert.equal(
      range.downloads.reduce((total, day) => total + day.downloads, 0),
      point.downloads,
    );
  });

  it('should throw `not-found` for downloads of an unknown package', async () => {
    // GIVEN
    const name: string = 'this-package-does-not-exist-zzq';

    // WHEN
    const promise: Promise<DownloadsPoint> = getDownloads(name, 'last-day');

    // THEN
    await assert.rejects(promise, hasCode('not-found'));
  });

  it('should work through a client', async () => {
    // GIVEN
    const client: NpmClient = createNpmClient({ registry: 'https://registry.npmjs.org/' });

    // WHEN
    const result: string = await client.getLatestVersion('@ashetm/types');

    // THEN
    assert.match(result, SEMVER);
  });

  it('should abort a request', async () => {
    // GIVEN
    const controller: AbortController = new AbortController();

    // WHEN
    const promise: Promise<Packument> = getPackage('typescript', { signal: controller.signal });
    controller.abort();

    // THEN
    await assert.rejects(promise, (error: unknown) => (error as Error).name === 'AbortError');
  });
});
