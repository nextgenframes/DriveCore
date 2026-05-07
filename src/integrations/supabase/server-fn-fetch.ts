// Attaches the current Supabase access token to every TanStack server-fn request.
// Server functions are protected by `requireSupabaseAuth`, which expects a
// `Authorization: Bearer <jwt>` header. The default useServerFn fetch does
// not forward auth, so we patch window.fetch once on the client.
import { supabase } from "./client";

let installed = false;

export function installServerFnAuthFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;

      if (url && url.includes("/_serverFn/")) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has("authorization")) {
            headers.set("authorization", `Bearer ${token}`);
          }
          return originalFetch(input, { ...init, headers });
        }
      }
    } catch {
      // fall through to original fetch
    }
    return originalFetch(input, init);
  };
}
