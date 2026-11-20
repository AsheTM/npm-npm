import { NpmApiError } from './error.ts';
import type { AbbreviatedPackument, AbbreviatedVersion, Bugs, DistTags, PackageVersion, Packument, Repository } from './package.types.ts';
import { parsePeople, parsePerson } from './person.ts';

type RawObject = Record<string, unknown>;

export const isObject: (value: unknown) => value is RawObject = (value): value is RawObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Sets `key` to `value`, or removes it when `value` is `undefined` (keeps `exactOptionalPropertyTypes` honest)
const assign: (target: RawObject, key: string, value: unknown) => void = (target, key, value) => {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
};

export const normalizeRepository: (value: unknown) => Repository | undefined = (value) => {
  if (typeof value === 'string') {
    return value.trim() === '' ? undefined : { type: 'git', url: value.trim() };
  }

  if (isObject(value) && typeof value['url'] === 'string') {
    return {
      type: typeof value['type'] === 'string' ? value['type'] : 'git',
      url: value['url'],
      ...(typeof value['directory'] === 'string' ? { directory: value['directory'] } : {}),
    };
  }

  return undefined;
};

export const normalizeBugs: (value: unknown) => Bugs | undefined = (value) => {
  if (typeof value === 'string') {
    return value.trim() === '' ? undefined : { url: value.trim() };
  }

  if (isObject(value)) {
    const bugs: Bugs = {
      ...(typeof value['url'] === 'string' ? { url: value['url'] } : {}),
      ...(typeof value['email'] === 'string' ? { email: value['email'] } : {}),
    };

    return Object.keys(bugs).length > 0 ? bugs : undefined;
  }

  return undefined;
};

// Old packages may send `{ type: 'MIT', url }`
export const normalizeLicense: (value: unknown) => string | undefined = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  return isObject(value) && typeof value['type'] === 'string' ? value['type'] : undefined;
};

const invalid: (url: string, what: string) => NpmApiError = (url, what) =>
  new NpmApiError(`Unexpected response from ${url}: ${what}`, { code: 'invalid-response', url });

export const normalizeDistTags: (raw: RawObject, url: string) => DistTags = (raw, url) => {
  if (typeof raw['latest'] !== 'string' || Object.values(raw).some((value) => typeof value !== 'string')) {
    throw invalid(url, 'dist-tags');
  }

  return raw as DistTags;
};

const isVersionLike: (raw: unknown) => raw is RawObject = (raw): raw is RawObject =>
  isObject(raw) && typeof raw['name'] === 'string' && typeof raw['version'] === 'string' && isObject(raw['dist']);

const normalizeVersions: <T>(raw: unknown, url: string, normalize: (version: RawObject) => T) => Record<string, T> = (
  raw,
  url,
  normalize,
) => {
  if (!isObject(raw)) {
    throw invalid(url, 'versions');
  }

  const versions: Record<string, ReturnType<typeof normalize>> = {};

  for (const [version, value] of Object.entries(raw)) {
    if (!isVersionLike(value)) {
      throw invalid(url, `version ${version}`);
    }

    versions[version] = normalize(value);
  }

  return versions;
};

const normalizeVersionFields: (raw: RawObject) => RawObject = (raw) => {
  const version: RawObject = { ...raw };

  if ('repository' in version) {
    assign(version, 'repository', normalizeRepository(version['repository']));
  }

  if ('license' in version) {
    assign(version, 'license', normalizeLicense(version['license']));
  }

  if (typeof version['deprecated'] !== 'string') {
    delete version['deprecated'];
  }

  return version;
};

export const normalizeVersion: (raw: RawObject, url: string) => PackageVersion = (raw, url) => {
  if (!isVersionLike(raw)) {
    throw invalid(url, 'version document');
  }

  return normalizeVersionFields(raw) as unknown as PackageVersion;
};

export const normalizePackument: (raw: RawObject, url: string) => Packument = (raw, url) => {
  if (typeof raw['name'] !== 'string' || !isObject(raw['dist-tags'])) {
    throw invalid(url, 'package document');
  }

  const packument: RawObject = { ...raw };

  packument['dist-tags'] = normalizeDistTags(raw['dist-tags'], url);
  packument['versions'] = normalizeVersions(raw['versions'], url, normalizeVersionFields);
  packument['time'] = isObject(raw['time']) ? raw['time'] : {};
  packument['maintainers'] = parsePeople(raw['maintainers']);

  if ('author' in packument) {
    assign(packument, 'author', parsePerson(packument['author']));
  }

  if ('repository' in packument) {
    assign(packument, 'repository', normalizeRepository(packument['repository']));
  }

  if ('bugs' in packument) {
    assign(packument, 'bugs', normalizeBugs(packument['bugs']));
  }

  if ('license' in packument) {
    assign(packument, 'license', normalizeLicense(packument['license']));
  }

  return packument as unknown as Packument;
};

export const normalizeAbbreviatedPackument: (raw: RawObject, url: string) => AbbreviatedPackument = (raw, url) => {
  if (typeof raw['name'] !== 'string' || !isObject(raw['dist-tags'])) {
    throw invalid(url, 'package document');
  }

  // A mirror that ignores the `Accept` header sends the full document: `modified` is then in `time`
  const time: unknown = raw['time'];
  const modified: unknown = raw['modified'] ?? (isObject(time) ? time['modified'] : undefined);

  return {
    ...raw,
    'dist-tags': normalizeDistTags(raw['dist-tags'], url),
    versions: normalizeVersions(raw['versions'], url, (version) => {
      const abbreviated: RawObject = { ...version };

      if (typeof abbreviated['deprecated'] !== 'string') {
        delete abbreviated['deprecated'];
      }

      return abbreviated as unknown as AbbreviatedVersion;
    }),
    modified: typeof modified === 'string' ? modified : '',
  } as AbbreviatedPackument;
};
