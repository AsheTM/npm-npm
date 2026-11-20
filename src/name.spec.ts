import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NpmApiError } from './error.ts';
import { assertPackageName, encodeDownloadsName, encodeRegistryName, isValidPackageName } from './name.ts';

describe('isValidPackageName', () => {
  for (const name of ['react', '@angular/core', 'lodash.debounce', 'a-b_c', '@ashetm/npm', 'x'.repeat(214)]) {
    it(`should accept ${JSON.stringify(name.length > 20 ? `${name.slice(0, 10)}... (${name.length})` : name)}`, () => {
      // GIVEN
      // a name that follows npm's rules

      // WHEN
      const result: boolean = isValidPackageName(name);

      // THEN
      assert.equal(result, true);
    });
  }

  for (const name of [
    '',
    ' react',
    'react ',
    '.react',
    '_react',
    'React',
    'node_modules',
    'favicon.ico',
    'a b',
    'a/b',
    '@scope',
    '@scope/',
    '@/name',
    '@scope/a/b',
    'café',
    'hello!',
    "it's",
    'x'.repeat(215),
  ]) {
    it(`should reject ${JSON.stringify(name.length > 20 ? `${name.slice(0, 10)}... (${name.length})` : name)}`, () => {
      // GIVEN
      // a name that breaks npm's rules

      // WHEN
      const result: boolean = isValidPackageName(name);

      // THEN
      assert.equal(result, false);
    });
  }

  it('should return false for a non-string value', () => {
    // GIVEN
    const name: unknown = 42;

    // WHEN
    const result: boolean = isValidPackageName(name as string);

    // THEN
    assert.equal(result, false);
  });
});

describe('assertPackageName', () => {
  it('should accept old names that npm still serves (uppercase)', () => {
    // GIVEN
    const name: string = 'JSONStream';

    // WHEN
    const run: () => void = () => assertPackageName(name);

    // THEN
    assert.doesNotThrow(run);
  });

  it('should throw an `invalid-name` error for a name that cannot exist', () => {
    // GIVEN
    const name: string = '../etc/passwd';

    // WHEN
    const run: () => void = () => assertPackageName(name);

    // THEN
    assert.throws(run, (error: unknown) => error instanceof NpmApiError && error.code === 'invalid-name' && error.url === '');
  });
});

describe('encodeRegistryName', () => {
  it('should keep an unscoped name as is', () => {
    // GIVEN
    const name: string = 'react';

    // WHEN
    const result: string = encodeRegistryName(name);

    // THEN
    assert.equal(result, 'react');
  });

  it('should encode the slash of a scoped name', () => {
    // GIVEN
    const name: string = '@angular/core';

    // WHEN
    const result: string = encodeRegistryName(name);

    // THEN
    assert.equal(result, '@angular%2Fcore');
  });
});

describe('encodeDownloadsName', () => {
  it('should keep a scoped name as is', () => {
    // GIVEN
    const name: string = '@angular/core';

    // WHEN
    const result: string = encodeDownloadsName(name);

    // THEN
    assert.equal(result, '@angular/core');
  });
});
