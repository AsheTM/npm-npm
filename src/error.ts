export type NpmApiErrorCode = 'not-found' | 'rate-limited' | 'invalid-name' | 'http' | 'network' | 'invalid-response';

export interface NpmApiErrorInit {
  code: NpmApiErrorCode;
  url: string;
  status?: number;
  retryAfter?: number;
  cause?: unknown;
}

// Thrown by every function when a request cannot give the expected data
export class NpmApiError extends Error {
  override readonly name: string = 'NpmApiError';
  declare readonly code: NpmApiErrorCode;
  // Requested URL (empty for `'invalid-name'`, thrown before any request)
  declare readonly url: string;
  // HTTP status, when the server answered
  declare readonly status?: number;
  // Seconds to wait before retrying, from the `Retry-After` header of a 429
  declare readonly retryAfter?: number;
  declare readonly cause?: unknown;

  constructor(message: string, init: NpmApiErrorInit) {
    super(message);
    this.code = init.code;
    this.url = init.url;

    if (init.status !== undefined) {
      this.status = init.status;
    }

    if (init.retryAfter !== undefined) {
      this.retryAfter = init.retryAfter;
    }

    if (init.cause !== undefined) {
      this.cause = init.cause;
    }
  }
}
