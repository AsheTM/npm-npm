import { NpmApiError } from './error.ts';

const MAX_LENGTH: number = 214;

const RESERVED_NAMES: readonly string[] = ['node_modules', 'favicon.ico'];

const SCOPED_NAME: RegExp = /^@([^/]+)\/([^/]+)$/;

const isUrlSafe: (value: string) => boolean = (value) => value.length > 0 && encodeURIComponent(value) === value;

// npm's rules that every published name follows, old ones included (some have uppercase letters, e.g. `JSONStream`)
const isExistingPackageName: (name: string) => boolean = (name) => {
  if (typeof name !== 'string' || name.length === 0 || name.trim() !== name) {
    return false;
  }

  if (name.startsWith('.') || name.startsWith('_') || RESERVED_NAMES.includes(name.toLowerCase())) {
    return false;
  }

  const scoped: RegExpExecArray | null = SCOPED_NAME.exec(name);

  return scoped ? isUrlSafe(scoped[1]!) && isUrlSafe(scoped[2]!) : isUrlSafe(name);
};

// npm's rules for a new package name: lowercase, at most 214 characters, URL-safe, optionally `@scope/name`
export const isValidPackageName: (name: string) => boolean = (name) =>
  isExistingPackageName(name) && name.length <= MAX_LENGTH && name === name.toLowerCase() && !/[~'!()*]/.test(name);

// Throws `'invalid-name'` before any request; accepts the old names that npm still serves
export const assertPackageName: (name: string) => void = (name) => {
  if (!isExistingPackageName(name)) {
    throw new NpmApiError(`Invalid npm package name: ${JSON.stringify(name)}`, { code: 'invalid-name', url: '' });
  }
};

// The registry wants `@scope%2Fname`
export const encodeRegistryName: (name: string) => string = (name) => name.replace('/', '%2F');

// The downloads API takes `@scope/name` as is
export const encodeDownloadsName: (name: string) => string = (name) => name;
