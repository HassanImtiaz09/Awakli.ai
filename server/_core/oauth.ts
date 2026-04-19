import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { authLog } from "../observability/logger";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import {
  NONCE_COOKIE_NAME,
  NONCE_COOKIE_OPTIONS,
  decodeState,
  encodeState,
  generateNonce,
  verifyNonce,
} from "./oauth-nonce";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  /**
   * H-9: OAuth start endpoint — generates nonce, sets cookie, redirects to portal.
   *
   * Frontend should link to /api/oauth/start?returnPath=/some/path instead of
   * constructing the OAuth URL directly. This ensures the nonce is always
   * server-generated and cookie-bound.
   */
  app.get("/api/oauth/start", (req: Request, res: Response) => {
    const returnPath = getQueryParam(req, "returnPath") || "/";
    const origin = getQueryParam(req, "origin") || `${req.protocol}://${req.get("host")}`;

    const nonce = generateNonce();
    const redirectUri = `${origin}/api/oauth/callback`;

    const state = encodeState({ nonce, redirectUri });

    // Set the nonce cookie (short-lived, HttpOnly, Secure, SameSite=lax)
    res.cookie(NONCE_COOKIE_NAME, nonce, NONCE_COOKIE_OPTIONS);

    // Store returnPath in a separate short-lived cookie so callback can redirect
    res.cookie("oauth_return_path", returnPath, {
      ...NONCE_COOKIE_OPTIONS,
      httpOnly: true,
    });

    const oauthPortalUrl =
      process.env.VITE_OAUTH_PORTAL_URL || "https://auth.manus.im";
    const appId = ENV.appId || "";

    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    res.redirect(302, url.toString());
  });

  /**
   * OAuth callback — verifies nonce, exchanges code, creates session.
   */
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // H-9: Decode state and verify nonce against cookie
    const statePayload = decodeState(state);

    if (!statePayload) {
      // Fallback for legacy state format (plain base64 redirect URI)
      // This handles in-flight OAuth flows that started before the nonce upgrade
      try {
        const legacyRedirectUri = atob(state);
        if (legacyRedirectUri.includes("/api/oauth/callback")) {
          // Legacy flow — proceed without nonce verification but log a warning
          authLog.warn("Legacy state format detected (no nonce). Allowing for backward compatibility.");
          await handleTokenExchange(req, res, code, state, "/");
          return;
        }
      } catch {
        // Not valid base64 either
      }
      res.status(403).json({ error: "Invalid OAuth state parameter" });
      return;
    }

    // Extract nonce from cookie
    const cookies = parseCookies(req.headers.cookie);
    const cookieNonce = cookies.get(NONCE_COOKIE_NAME);

    if (!verifyNonce(statePayload.nonce, cookieNonce)) {
      authLog.warn("Nonce mismatch — possible CSRF attempt", {
        stateNonce: statePayload.nonce?.substring(0, 8) + "...",
        hasCookieNonce: !!cookieNonce,
      });
      // Clear the nonce cookie
      res.clearCookie(NONCE_COOKIE_NAME, { path: "/" });
      res.status(403).json({ error: "OAuth state verification failed (CSRF protection)" });
      return;
    }

    // Clear the nonce cookie immediately after verification
    res.clearCookie(NONCE_COOKIE_NAME, { path: "/" });

    // Get return path from cookie
    const returnPath = cookies.get("oauth_return_path") || "/";
    res.clearCookie("oauth_return_path", { path: "/" });

    await handleTokenExchange(req, res, code, state, returnPath);
  });
}

/**
 * Shared token exchange logic used by both nonce-verified and legacy flows.
 */
async function handleTokenExchange(
  req: Request,
  res: Response,
  code: string,
  state: string,
  returnPath: string
) {
  try {
    const tokenResponse = await sdk.exchangeCodeForToken(code, state);
    const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

    if (!userInfo.openId) {
      res.status(400).json({ error: "openId missing from user info" });
      return;
    }

    await db.upsertUser({
      openId: userInfo.openId,
      name: userInfo.name || null,
      email: userInfo.email ?? null,
      loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
      lastSignedIn: new Date(),
    });

    const sessionToken = await sdk.createSessionToken(userInfo.openId, {
      name: userInfo.name || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS,
    });

    // Redirect to the return path (sanitize to prevent open redirect)
    const safePath = returnPath.startsWith("/") ? returnPath : "/";
    res.redirect(302, safePath);
  } catch (error) {
    authLog.error("Callback failed", { error: String(error) });
    res.status(500).json({ error: "OAuth callback failed" });
  }
}

/** Simple cookie parser (avoids importing cookie package at top level) */
function parseCookies(
  cookieHeader: string | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  for (const pair of cookieHeader.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.substring(0, eqIdx).trim();
    const val = pair.substring(eqIdx + 1).trim();
    map.set(key, decodeURIComponent(val));
  }
  return map;
}
