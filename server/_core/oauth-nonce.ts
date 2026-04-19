/**
 * H-9: OAuth State Nonce — CSRF Protection
 *
 * Replaces the insecure atob(state) pattern with a cryptographically random
 * nonce bound to a short-lived HttpOnly cookie. The flow:
 *
 * 1. GET /api/oauth/start — generates a random nonce, stores it in a
 *    signed cookie (oauth_nonce, 10 min TTL), encodes {nonce, redirectUri}
 *    into the state param, and redirects to the OAuth portal.
 *
 * 2. GET /api/oauth/callback — decodes state, extracts nonce, compares it
 *    to the cookie value. If they don't match → 403. If they match → proceed
 *    with token exchange. The nonce cookie is cleared immediately.
 *
 * This prevents CSRF because an attacker cannot forge the nonce cookie
 * (HttpOnly + SameSite=lax + Secure).
 */

import crypto from "node:crypto";

const NONCE_COOKIE_NAME = "oauth_nonce";
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Encoded state payload: nonce + redirect URI */
export interface OAuthStatePayload {
  nonce: string;
  redirectUri: string;
}

/** Generate a cryptographically random nonce (32 hex chars) */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Encode the state payload as a base64 JSON string */
export function encodeState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** Decode the state parameter back to a payload. Returns null on failure. */
export function decodeState(state: string): OAuthStatePayload | null {
  try {
    const json = Buffer.from(state, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.nonce === "string" &&
      typeof parsed.redirectUri === "string"
    ) {
      return parsed as OAuthStatePayload;
    }
    // Fallback: try legacy atob format (plain redirect URI)
    return null;
  } catch {
    return null;
  }
}

/** Verify that the nonce from the state matches the nonce from the cookie */
export function verifyNonce(
  stateNonce: string,
  cookieNonce: string | undefined
): boolean {
  if (!cookieNonce || !stateNonce) return false;
  // Constant-time comparison to prevent timing attacks
  if (stateNonce.length !== cookieNonce.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(stateNonce),
    Buffer.from(cookieNonce)
  );
}

export const NONCE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: NONCE_TTL_MS,
};

export { NONCE_COOKIE_NAME, NONCE_TTL_MS };
