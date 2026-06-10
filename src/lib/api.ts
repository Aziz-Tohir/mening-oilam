// REST client for the .NET 10 backend. Replaces the Supabase client + TanStack server functions.
// Tokens are stored in localStorage; a 401 triggers a single refresh attempt.

const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:5080";

const ACCESS_KEY = "mo_access_token";
const REFRESH_KEY = "mo_refresh_token";

type Listener = () => void;
const listeners = new Set<Listener>();
export function onAuthChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const l of listeners) l();
}

export function getAccessToken(): string | null {
  try { return localStorage.getItem(ACCESS_KEY); } catch { return null; }
}
export function getRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
}
export function setTokens(access: string, refresh: string) {
  try {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {}
  emit();
}
export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {}
  emit();
}
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

async function rawFetch(path: string, init: RequestInit, withAuth: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (withAuth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refresh = getRefreshToken();
    if (!refresh) return false;
    try {
      const res = await rawFetch("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refresh }),
      }, false);
      if (!res.ok) { clearTokens(); return false; }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiFetch<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean; raw?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true, raw = false } = opts;
  const init: RequestInit = { method };
  if (body !== undefined) init.body = raw ? body : JSON.stringify(body);

  let res = await rawFetch(path, init, auth);
  if (res.status === 401 && auth && (await tryRefresh())) {
    res = await rawFetch(path, init, auth);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || j.message || msg; } catch {}
    if (res.status === 401) clearTokens();
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? await res.json() : (await res.text())) as T;
}

export const apiGet = <T = any>(path: string) => apiFetch<T>(path, { method: "GET" });
export const apiPost = <T = any>(path: string, body?: any) => apiFetch<T>(path, { method: "POST", body });
export const apiPatch = <T = any>(path: string, body?: any) => apiFetch<T>(path, { method: "PATCH", body });
export const apiDelete = <T = any>(path: string) => apiFetch<T>(path, { method: "DELETE" });

// ---------- Auth ----------
export async function login(email: string, password: string) {
  const data = await apiFetch("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
  setTokens(data.access_token, data.refresh_token);
  return data;
}
export async function register(email: string, password: string, displayName?: string) {
  const data = await apiFetch("/api/auth/register", { method: "POST", body: { email, password, display_name: displayName }, auth: false });
  setTokens(data.access_token, data.refresh_token);
  return data;
}
export async function logout() {
  const refresh = getRefreshToken();
  try { if (refresh) await apiFetch("/api/auth/logout", { method: "POST", body: { refresh_token: refresh }, auth: false }); } catch {}
  clearTokens();
}
export async function me() {
  return apiFetch("/api/auth/me", { method: "GET" });
}

// ---------- Telegram mini app ----------
export async function miniAppAuth(initData: string) {
  const data = await apiFetch("/api/public/telegram/miniapp-auth", { method: "POST", body: { init_data: initData }, auth: false });
  if (data?.access_token) setTokens(data.access_token, data.refresh_token);
  return data;
}
export async function miniAppRegister(initData: string, inviteCode: string) {
  return apiFetch("/api/public/telegram/miniapp-register", { method: "POST", body: { init_data: initData, invite_code: inviteCode }, auth: false });
}

// ---------- File upload ----------
export async function uploadAvatar(file: Blob, fileName = "avatar.jpg"): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file, fileName);
  return apiFetch("/api/files/avatar", { method: "POST", body: fd, raw: true });
}

export { API_BASE };
