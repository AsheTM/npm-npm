import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePeople, parsePerson } from './person.ts';
import type { Person } from './person.ts';

describe('parsePerson', () => {
  const cases: [string, unknown, Person | undefined][] = [
    ['a full string', 'Jane Doe <jane@example.com> (https://example.com)', { name: 'Jane Doe', email: 'jane@example.com', url: 'https://example.com' }],
    ['a name and an email', 'Jane Doe <jane@example.com>', { name: 'Jane Doe', email: 'jane@example.com' }],
    ['a name and a url', 'Jane Doe (https://example.com)', { name: 'Jane Doe', url: 'https://example.com' }],
    ['a name only', '  Jane Doe  ', { name: 'Jane Doe' }],
    ['an email only', '<jane@example.com>', { name: '', email: 'jane@example.com' }],
    ['an unusual order (kept as the name)', 'Jane (https://example.com) <jane@example.com>', { name: 'Jane (https://example.com) <jane@example.com>' }],
    ['an object', { name: 'Jane', email: 'jane@example.com', url: 'https://example.com' }, { name: 'Jane', email: 'jane@example.com', url: 'https://example.com' }],
    ['an old object with `mail` / `web`', { name: 'Jane', mail: 'jane@example.com', web: 'https://example.com' }, { name: 'Jane', email: 'jane@example.com', url: 'https://example.com' }],
    ['an object without a name', { email: 'jane@example.com' }, { name: '', email: 'jane@example.com' }],
    ['an empty string', '   ', undefined],
    ['an empty object', {}, undefined],
    ['null', null, undefined],
    ['a number', 42, undefined],
  ];

  for (const [label, value, expected] of cases) {
    it(`should parse ${label}`, () => {
      // GIVEN
      // `value` from the registry

      // WHEN
      const result: Person | undefined = parsePerson(value);

      // THEN
      assert.deepEqual(result, expected);
    });
  }
});

describe('parsePeople', () => {
  it('should parse an array and drop what is not a person', () => {
    // GIVEN
    const value: unknown = ['Jane <jane@example.com>', { name: 'John' }, 42, ''];

    // WHEN
    const result: Person[] = parsePeople(value);

    // THEN
    assert.deepEqual(result, [{ name: 'Jane', email: 'jane@example.com' }, { name: 'John' }]);
  });

  it('should wrap a single person', () => {
    // GIVEN
    const value: unknown = 'Jane';

    // WHEN
    const result: Person[] = parsePeople(value);

    // THEN
    assert.deepEqual(result, [{ name: 'Jane' }]);
  });

  it('should return an empty array when missing', () => {
    // GIVEN
    const value: unknown = undefined;

    // WHEN
    const result: Person[] = parsePeople(value);

    // THEN
    assert.deepEqual(result, []);
  });
});
