export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// SessionStorage key for post-login redirect
export const STORAGE_KEY_RETURN_PATH = "awakli_return_path";

// Generate login URL at runtime so redirect URI reflects the current origin.
// Accepts an optional returnPath — stored in sessionStorage so the app can
// redirect after OAuth completes (the redirect URI itself stays clean).
export const getLoginUrl = (returnPath?: string) => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  // Store the desired return path so we can redirect after OAuth callback
  if (returnPath) {
    sessionStorage.setItem(STORAGE_KEY_RETURN_PATH, returnPath);
  }

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
