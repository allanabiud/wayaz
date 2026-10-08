import type { TokenResponse } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const ACCESS_KEY = "wayaz.access";
const REFRESH_KEY = "wayaz.refresh";

export const tokenStore = {
  get access() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  save(tokens: { access: string; refresh?: string }) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACCESS_KEY, tokens.access);
    if (tokens.refresh) window.localStorage.setItem(REFRESH_KEY, tokens.refresh);
  },
  clear() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "string") parts.push(`${key}: ${value}`);
      else if (Array.isArray(value)) parts.push(`${key}: ${value.join(", ")}`);
    }
    if (parts.length) return parts.join(" · ");
  }
  return `Request failed with status ${status}`;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccess(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refresh = tokenStore.refresh;
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access: string };
      tokenStore.save({ access: data.access });
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  anonymous?: boolean;
  raw?: BodyInit;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, raw, headers, ...rest } = options;

  const doFetch = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        ...(body !== undefined && !raw
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });

  let res = await doFetch(anonymous ? null : tokenStore.access);

  if (res.status === 401 && !anonymous && tokenStore.refresh) {
    if (await refreshAccess()) {
      res = await doFetch(tokenStore.access);
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed: unknown = text ? safeParse(text) : null;

  if (!res.ok) throw new ApiError(res.status, readError(parsed, res.status), parsed);

  return parsed as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
  upload: <T>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", raw: form }),
};

export function login(username: string, password: string) {
  return api.post<TokenResponse>("/api/v1/auth/token/", {
    username,
    password,
  });
}
