// Wrapper hook that calls server functions with the user's auth bearer token.
import { supabase } from "@/integrations/supabase/client";

export async function callServer<T>(fn: (input: any) => Promise<T>, payload?: any): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  // Patch fetch globally for this call by injecting Authorization header via TanStack server fn.
  // TanStack server fns auto-include cookies; for Supabase auth we attach Authorization manually.
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
    return origFetch(input, { ...init, headers });
  }) as typeof fetch;
  try {
    return await fn(payload === undefined ? undefined : { data: payload });
  } finally {
    globalThis.fetch = origFetch;
  }
}
