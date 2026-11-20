// A person in npm metadata (author, maintainer); npm sometimes sends `"Name <email> (url)"`, always normalized to this object
export interface Person {
  name: string;
  email?: string;
  url?: string;
}

const PERSON_STRING: RegExp = /^([^<(]*?)\s*(?:<([^>]*)>)?\s*(?:\(([^)]*)\))?\s*$/;

const nonEmpty: (value: unknown) => string | undefined = (value) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const toPerson: (name: string | undefined, email: string | undefined, url: string | undefined) => Person | undefined = (
  name,
  email,
  url,
) => {
  if (name === undefined && email === undefined && url === undefined) {
    return undefined;
  }

  return {
    name: name ?? '',
    ...(email === undefined ? {} : { email }),
    ...(url === undefined ? {} : { url }),
  };
};

// `"Name <email> (url)"` or `{ name, email?, url? }` → `Person`; anything else → `undefined`
export const parsePerson: (value: unknown) => Person | undefined = (value) => {
  if (typeof value === 'string') {
    const match: RegExpExecArray | null = PERSON_STRING.exec(value.trim());

    return match ? toPerson(nonEmpty(match[1]), nonEmpty(match[2]), nonEmpty(match[3])) : toPerson(nonEmpty(value), undefined, undefined);
  }

  if (typeof value === 'object' && value !== null) {
    const { name, email, mail, url, web } = value as Record<string, unknown>;

    return toPerson(nonEmpty(name), nonEmpty(email) ?? nonEmpty(mail), nonEmpty(url) ?? nonEmpty(web));
  }

  return undefined;
};

export const parsePeople: (value: unknown) => Person[] = (value) =>
  (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
    .map(parsePerson)
    .filter((person): person is Person => person !== undefined);
