/** Problem details returned by the API (RFC 9457), with Spanish `detail`. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  requestId?: string;
  errors?: { field?: string; line?: number; message: string }[];
}

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }
}

export interface Session {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_KEY = 'scip.refresh-token';

let session: Session | null = null;
let refreshing: Promise<Session | null> | null = null;
let onSessionChange: (value: Session | null, profile?: unknown) => void = () => undefined;

export function subscribeSession(listener: typeof onSessionChange): void {
  onSessionChange = listener;
}

export function storedRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setSession(value: Session | null, profile?: unknown): void {
  session = value;
  try {
    if (value) localStorage.setItem(REFRESH_KEY, value.refreshToken);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Private mode: the session simply does not survive a reload.
  }
  onSessionChange(value, profile);
}

/** Rotates the refresh token once, even if several requests hit a 401 at the same time. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    const refreshToken = session?.refreshToken ?? storedRefreshToken();
    if (!refreshToken) return null;
    const response = await fetch('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      setSession(null);
      return null;
    }
    const body = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      user: unknown;
    };
    const next = { accessToken: body.accessToken, refreshToken: body.refreshToken };
    setSession(next, body.user);
    return next;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

type Body = Record<string, unknown> | unknown[] | string | undefined;

async function send(
  method: string,
  url: string,
  body: Body,
  token: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  let payload: string | undefined;
  if (typeof body === 'string') {
    headers['content-type'] = 'text/csv';
    payload = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return fetch(url, { method, headers, ...(payload === undefined ? {} : { body: payload }) });
}

export async function request<T>(method: string, url: string, body?: Body): Promise<T> {
  let response = await send(method, url, body, session?.accessToken);
  if (response.status === 401 && !url.startsWith('/v1/auth/')) {
    const renewed = await refreshSession();
    if (renewed) response = await send(method, url, body, renewed.accessToken);
  }
  if (!response.ok) {
    let problem: Problem;
    try {
      problem = (await response.json()) as Problem;
    } catch {
      problem = {
        type: 'about:blank',
        title: 'Error',
        status: response.status,
        detail:
          response.status >= 500
            ? 'El servidor no respondió como se esperaba. Intenta de nuevo en un momento.'
            : 'No se pudo completar la operación.',
        code: `http.${String(response.status)}`,
      };
    }
    throw new ApiError(problem);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: Body) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: Body) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: Body) => request<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

/** Human message for any error thrown by a query or mutation. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail;
  if (error instanceof TypeError)
    return 'No hay conexión con el servidor. Revisa la red e intenta de nuevo.';
  return 'Ocurrió un error inesperado.';
}
