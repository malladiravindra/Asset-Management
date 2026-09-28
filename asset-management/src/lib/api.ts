const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api";

type ApiResponse<T> = T | { results: T; count?: number; next?: string | null; previous?: string | null };

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, details: unknown) {
    super(safeApiMessage(details));
    this.status = status;
    this.details = details;
  }
}

export function safeApiMessage(details: unknown) {
  if (typeof details === "string" && details.length <= 180) return details;
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    for (const key of ["detail", "message", "error"]) {
      if (typeof record[key] === "string" && record[key].length <= 180) return record[key];
    }
    for (const [field, value] of Object.entries(record)) {
      const message = Array.isArray(value) ? value.find((item): item is string => typeof item === "string") : value;
      if (typeof message === "string") return field === "non_field_errors" ? message : `${field}: ${message}`;
    }
  }
  return "The server could not complete the request.";
}

function accessToken() {
  return typeof window === "undefined" ? null : window.localStorage.getItem("assetflow.access");
}

// Shared by request(), apiDownload(), and apiUpload() so any of the three can
// build an Authorization header the same way and stay consistent if the
// token key ever changes.
function authHeaders(existing?: HeadersInit) {
  const headers = new Headers(existing);
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

function logApi(level: "log" | "error", message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  // Error instances have non-enumerable message/stack, so spreading one into
  // a plain object (as the network-failure branch below does) silently drops
  // all useful information — normalize it first so failures stay diagnosable.
  const normalized =
    details.error instanceof Error
      ? { ...details, error: { name: details.error.name, message: details.error.message } }
      : details;
  console[level](message, normalized);
}

function requestDetails(path: string, init: RequestInit) {
  return { method: init.method ?? "GET", endpoint: path, payload: init.body ? "[JSON payload]" : undefined };
}

// The dashboard mounts ~15 providers that each fire a request on load, so an
// expired access token produces a burst of simultaneous 401s. The backend
// rotates + blacklists the refresh token on every use (ROTATE_REFRESH_TOKENS
// + BLACKLIST_AFTER_ROTATION), so if each request refreshed independently,
// only the first would succeed — every other concurrent refresh call would
// reuse the now-blacklisted token and fail, clearing the session and
// blanking every other module even though the access token was, in fact,
// refreshable. Sharing one in-flight refresh across all callers fixes that.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = window.localStorage.getItem("assetflow.refresh");
    if (!refresh) return null;
    const refreshResponse = await fetch(`${API_BASE_URL}/accounts/token/refresh/`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!refreshResponse.ok) return null;
    const refreshed = (await refreshResponse.json()) as { access: string; refresh?: string };
    window.localStorage.setItem("assetflow.access", refreshed.access);
    if (refreshed.refresh) window.localStorage.setItem("assetflow.refresh", refreshed.refresh);
    return refreshed.access;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const requestMeta = requestDetails(path, init);
  const headers = authHeaders(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  logApi("log", "[API REQUEST]", requestMeta);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, cache: "no-store", headers });
  } catch (error) {
    logApi("error", "[API ERROR]", { ...requestMeta, status: 0, error });
    throw new ApiError(0, "Unable to connect to the backend server. Please check that Django is running.");
  }
  if (response.status === 401 && retry && typeof window !== "undefined") {
    const newAccess = await refreshAccessToken();
    if (newAccess) return request<T>(path, init, false);
    window.localStorage.removeItem("assetflow.access");
    window.localStorage.removeItem("assetflow.refresh");
    if (window.location.pathname !== "/") window.location.href = "/";
  }

  const text = await response.text();
  let responseData: unknown = text;
  try {
    responseData = text ? JSON.parse(text) : null;
  } catch {
    // Preserve non-JSON server errors as text.
  }
  if (!response.ok) {
    logApi("error", "[API ERROR]", { ...requestMeta, status: response.status, error: responseData });
    throw new ApiError(response.status, responseData);
  }
  logApi("log", "[API RESPONSE]", { ...requestMeta, status: response.status, data: responseData });
  return (responseData ?? {}) as T;
}

export function apiGet<T>(path: string) {
  return request<T>(path);
}

export function apiPost<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T = unknown>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

export function unwrapResults<T>(response: ApiResponse<T[]>) {
  return Array.isArray(response) ? response : response.results;
}

/**
 * Shared session-teardown logic: best-effort blacklist the refresh token
 * server-side (POST /accounts/logout/), then clear both JWT tokens from
 * localStorage — the same sequence topbar.tsx's handleLogout already used.
 * Callers still need to clear the AuthProvider user (useCurrentUser().logout())
 * and navigate away (router.push("/")) themselves, since this module has no
 * access to React context/router.
 */
export async function logoutRequest() {
  const refresh = typeof window === "undefined" ? null : window.localStorage.getItem("assetflow.refresh");
  try {
    if (refresh) await apiPost("/accounts/logout/", { refresh });
  } catch {
    // Best-effort — the token may already be expired/blacklisted; still
    // clear local state below so the user ends up logged out either way.
  } finally {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("assetflow.access");
      window.localStorage.removeItem("assetflow.refresh");
    }
  }
}

type PaginatedResponse<T> = { count: number; next: string | null; previous: string | null; results: T[] };

/**
 * Fetch every row of a paginated list endpoint, following `next` links
 * until exhausted, instead of silently keeping only the first page (every
 * list endpoint in this API paginates at PAGE_SIZE=20 server-side — see
 * asset_backend REST_FRAMEWORK settings). Asks for a bounded page size
 * (well under every endpoint's max_page_size=100, see each app's
 * `*Pagination` class in asset_backend) rather than the largest page
 * size allowed, so a normal-sized table loads in a small, constant
 * number of round trips instead of one very large one; `next` still
 * covers however many pages that actually takes — the complete dataset
 * this function returns is unchanged either way, which is what the
 * existing client-side-paginated tables (e.g. assets/table.tsx) depend on.
 *
 * Use this instead of a plain `apiGet<{ results: T[] }>(path)` for any
 * list a table/grid needs to show in full (not a manually paginated view).
 */
export async function apiGetAll<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  let nextPath: string | null = `${path}${separator}page_size=50`;
  while (nextPath) {
    const page: T[] | PaginatedResponse<T> = await apiGet<T[] | PaginatedResponse<T>>(nextPath);
    if (Array.isArray(page)) {
      results.push(...page);
      break;
    }
    results.push(...page.results);
    nextPath = page.next ? page.next.replace(/^https?:\/\/[^/]+\/api/, "") : null;
  }
  return results;
}

// Downloads now share the same "no-store" guarantee and Authorization-header
// logic as every other call in this file, instead of a hand-rolled fetch that
// could silently serve a stale cached file and had no 401-refresh handling.
export async function apiDownload(path: string, defaultFilename: string): Promise<void> {
  const headers = authHeaders();

  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store", headers });
  if (!response.ok) {
    const text = await response.text();
    let errData: unknown = text;
    try {
      errData = JSON.parse(text);
    } catch {}
    throw new ApiError(response.status, errData);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const disposition = response.headers.get("Content-Disposition");
  let filename = defaultFilename;
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename=["']?([^"';]+)["']?/);
    if (match?.[1]) filename = match[1];
  }
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// Uploads also now go through the shared header builder and use "no-store",
// so a re-uploaded file with the same URL/params can never be short-circuited
// by the browser's HTTP cache.
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const headers = authHeaders();

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: formData,
  });

  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  if (!response.ok && response.status !== 207) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}