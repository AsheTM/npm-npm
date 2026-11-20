export interface FetchCall {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal | undefined;
}

export interface FakeFetch {
  fetch: typeof fetch;
  calls: FetchCall[];
}

export type FakeHandler = (url: string) => Response | Promise<Response>;

export const jsonResponse: (body: unknown, init?: ResponseInit) => Response = (body, init) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

// A `fetch` that records each call and answers with `handler`; no network
export const fakeFetch: (handler: FakeHandler) => FakeFetch = (handler) => {
  const calls: FetchCall[] = [];

  const fetchFn: typeof fetch = async (input, init) => {
    const url: string = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    calls.push({ url, headers: { ...(init?.headers as Record<string, string> | undefined) }, signal: init?.signal ?? undefined });

    if (init?.signal?.aborted) {
      throw init.signal.reason;
    }

    return handler(url);
  };

  return { fetch: fetchFn, calls };
};
