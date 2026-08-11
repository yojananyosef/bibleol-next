/**
 * oauth2.ts — Port de Ctrl_oauth2::common_callback + Ctrl_login (request URLs)
 * y Mod_users::revoke_google_permissions. Lógica pura con fetch inyectable
 * (testable); la cookie de flujo y la sesión se gestionan en los route handlers.
 */

import { createHmac, randomBytes } from "node:crypto";
import type { AppConfig } from "../config.ts";

export type OAuth2Authority = "google" | "facebook";

/** Datos del usuario devueltos por el proveedor, ya normalizados. */
export interface OAuth2UserInfo {
  id: string;
  first_name: string;
  last_name: string;
  family_name_first: boolean;
  email: string | null;
}

/** Md5(rand()) del legacy — state anti-CSRF. */
export function oauth2State(): string {
  return randomBytes(16).toString("hex");
}

export function siteUrl(path: string): string {
  const base = process.env.BIBLEOL_BASE_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}

/** Ctrl_login::index — parámetros de la petición de autorización. */
export function authRequest(authority: OAuth2Authority, state: string, cfg: AppConfig): URLSearchParams {
  const base = {
    response_type: "code",
    client_id: cfg.google_client_id,
    redirect_uri: siteUrl(`/oauth2/google_callback`),
    state,
  };
  switch (authority) {
    case "google":
      base.client_id = cfg.google_client_id;
      return new URLSearchParams({
        ...base,
        scope: "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
      });
    case "facebook":
      base.client_id = cfg.facebook_client_id;
      base.redirect_uri = siteUrl("/oauth2/facebook_callback");
      return new URLSearchParams({ ...base, scope: "email" });
  }
}

/** URL de autorización del proveedor (view_login enlaza aquí). */
export function authUrl(authority: OAuth2Authority, state: string, cfg: AppConfig): string {
  const q = authRequest(authority, state, cfg);
  return authority === "google"
    ? `https://accounts.google.com/o/oauth2/auth?${q}`
    : `https://www.facebook.com/dialog/oauth?${q}`;
}

/** common_callback: canjea el código por un access token. */
export async function exchangeCode(
  authority: OAuth2Authority,
  code: string,
  cfg: AppConfig,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  if (authority === "google") {
    const data = new URLSearchParams({
      code,
      client_id: cfg.google_client_id,
      client_secret: cfg.google_client_secret,
      redirect_uri: siteUrl("/oauth2/google_callback"),
      grant_type: "authorization_code",
    });
    const res = await fetchFn("https://accounts.google.com/o/oauth2/token", {
      method: "POST",
      headers: { "Content-type": "application/x-www-form-urlencoded" },
      body: data,
    });
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? "";
  }
  const data = new URLSearchParams({
    code,
    client_id: cfg.facebook_client_id,
    client_secret: cfg.facebook_client_secret,
    redirect_uri: siteUrl("/oauth2/facebook_callback"),
  });
  const res = await fetchFn(`https://graph.facebook.com/v2.12/oauth/access_token?${data}`);
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? "";
}

/** common_callback: obtiene y normaliza la info del usuario remoto. */
export async function fetchUserInfo(
  authority: OAuth2Authority,
  accessToken: string,
  cfg: AppConfig,
  fetchFn: typeof fetch = fetch,
): Promise<OAuth2UserInfo> {
  if (authority === "google") {
    const url = `https://www.googleapis.com/oauth2/v1/userinfo?${new URLSearchParams({ access_token: accessToken })}`;
    const res = await fetchFn(url);
    const u = (await res.json()) as {
      id: string;
      given_name: string;
      family_name: string;
      name: string;
      email?: string;
    };
    return {
      id: u.id,
      first_name: u.given_name,
      last_name: u.family_name,
      // ¿Infalible? (comentario del legacy)
      family_name_first: u.name === `${u.family_name}${u.given_name}`,
      email: u.email ?? null,
    };
  }
  const data = new URLSearchParams({
    access_token: accessToken,
    appsecret_proof: hmacSha256(accessToken, cfg.facebook_client_secret),
    fields: "id,first_name,last_name,email,name,name_format",
  });
  const res = await fetchFn(`https://graph.facebook.com/v2.12/me?${data}`);
  const u = (await res.json()) as {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    name_format?: string;
  };
  return {
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name,
    family_name_first: u.name_format === "{last}{first}",
    email: u.email ?? null,
  };
}

/** hash_hmac('sha256', token, secret) del legacy. */
function hmacSha256(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Mod_users::revoke_google_permissions — devuelve el código HTTP como string. */
export async function revokeGooglePermissions(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(`https://accounts.google.com/o/oauth2/revoke?${new URLSearchParams({ token: accessToken })}`);
  return String(res.status);
}
