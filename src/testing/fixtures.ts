// Small registry documents, shaped like the real ones
export const versionDocument: (name: string, version: string, extra?: Record<string, unknown>) => Record<string, unknown> = (
  name,
  version,
  extra = {},
) => ({
  name,
  version,
  description: 'A package',
  dist: {
    tarball: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`,
    shasum: 'abc',
    integrity: 'sha512-abc',
  },
  ...extra,
});

export const packumentDocument: (name: string, extra?: Record<string, unknown>) => Record<string, unknown> = (name, extra = {}) => ({
  _id: name,
  name,
  description: 'A package',
  'dist-tags': { latest: '1.1.0', next: '2.0.0-rc.0' },
  versions: {
    '1.0.0': versionDocument(name, '1.0.0'),
    '1.1.0': versionDocument(name, '1.1.0'),
    '2.0.0-rc.0': versionDocument(name, '2.0.0-rc.0'),
  },
  time: {
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-03-01T00:00:00.000Z',
    '1.0.0': '2026-01-01T00:00:00.000Z',
    '1.1.0': '2026-02-01T00:00:00.000Z',
    '2.0.0-rc.0': '2026-03-01T00:00:00.000Z',
  },
  maintainers: [{ name: 'jane', email: 'jane@example.com' }],
  author: { name: 'Jane Doe', email: 'jane@example.com', url: 'https://example.com' },
  license: 'MIT',
  repository: { type: 'git', url: 'git+https://github.com/example/repo.git' },
  homepage: 'https://github.com/example/repo#readme',
  bugs: { url: 'https://github.com/example/repo/issues' },
  keywords: ['example'],
  readme: '# Example',
  ...extra,
});
