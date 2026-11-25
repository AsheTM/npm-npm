// In-memory response cache used by `createNpmClient({ cache })`
export interface CacheOptions {
  // Seconds a response is reused without a request (default: 300, like npm's `max-age`)
  ttl?: number;
  // Most responses kept; the least recently used is dropped (default: 500)
  maxEntries?: number;
}

export const DEFAULT_CACHE: Required<CacheOptions> = { ttl: 300, maxEntries: 500 };

export interface CacheEntry {
  body: object;
  // Time (ms) after which the entry needs a new request
  expires: number;
}

export class ResponseCache {
  readonly ttl: number;
  readonly maxEntries: number;
  readonly #entries: Map<string, CacheEntry> = new Map();
  readonly #pending: Map<string, Promise<object>> = new Map();
  readonly #now: () => number;

  constructor(options: CacheOptions = {}, now: () => number = Date.now) {
    const settings: Required<CacheOptions> = { ...DEFAULT_CACHE, ...options };

    this.ttl = Math.max(0, settings.ttl);
    this.maxEntries = Math.max(1, Math.trunc(settings.maxEntries));
    this.#now = now;
  }

  get size(): number {
    return this.#entries.size;
  }

  // A fresh entry (and marks it as recently used), or `undefined`
  getFresh(key: string): CacheEntry | undefined {
    const entry: CacheEntry | undefined = this.#entries.get(key);

    if (!entry || entry.expires <= this.#now()) {
      return undefined;
    }

    this.#entries.delete(key);
    this.#entries.set(key, entry);

    return entry;
  }

  set(key: string, body: object): void {
    this.#entries.delete(key);
    this.#entries.set(key, { body, expires: this.#now() + this.ttl * 1000 });

    while (this.#entries.size > this.maxEntries) {
      this.#entries.delete(this.#entries.keys().next().value!);
    }
  }

  pending(key: string): Promise<object> | undefined {
    return this.#pending.get(key);
  }

  track(key: string, promise: Promise<object>): void {
    this.#pending.set(key, promise);
    promise.then(
      () => this.#pending.delete(key),
      () => this.#pending.delete(key),
    );
  }

  clear(): void {
    this.#entries.clear();
  }
}

// Where `createNpmClient` puts its cache in the options it passes down (kept out of the public options)
export const CACHE: unique symbol = Symbol('@ashetm/npm cache');

export const resolveCache: (cache: boolean | CacheOptions | undefined) => ResponseCache | undefined = (cache) =>
  cache ? new ResponseCache(cache === true ? {} : cache) : undefined;
