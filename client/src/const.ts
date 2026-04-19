export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// SessionStorage key for post-login redirect
export const STORAGE_KEY_RETURN_PATH = "awakli_return_path";

/**
 * Generate login URL that routes through the server-side /api/oauth/start
 * endpoint. This ensures the OAuth state parameter contains a cryptographically
 * random nonce bound to a session cookie (H-9 CSRF protection).
 *
 * The server generates the nonce, sets it as an HttpOnly cookie, and redirects
 * to the OAuth portal with a properly signed state parameter.
 */
export const getLoginUrl = (returnPath?: string) => {
  const url = new URL("/api/oauth/start", window.location.origin);
  url.searchParams.set("origin", window.location.origin);
  if (returnPath) {
    url.searchParams.set("returnPath", returnPath);
  }
  return url.toString();
};
