/**
 * oauth2-cookie.ts — Cookie `ol_oauth2` con el flujo OAuth2 en curso
 * (state anti-CSRF, access_token del proveedor, new_oauth2 del legacy).
 * Firmada con jose (misma clave que la sesión) para que sea íntegra.
 */

import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import type { OAuth2Authority } from "./oauth2.ts";

export interface OAuth2Flow {
  state?: string;
  accessToken?: string;
  newOauth2?: OAuth2Authority;
}

const COOKIE_NAME = "ol_oauth2";
const MAX_AGE = 3600; // 1 hora (revocación del token de Google requiere menos)

function oauth2Secret(): Uint8Array {
  const secret = process.env.BIBLEOL_SESSION_SECRET ?? "dev-only-secret-change-me";
  return new TextEncoder().encode(secret);
}

async function sign(data: OAuth2Flow): Promise<string> {
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + MAX_AGE)
    .sign(oauth2Secret());
}

export async function getOAuth2Flow(): Promise<OAuth2Flow | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, oauth2Secret(), { algorithms: ["HS256"] });
    return {
      state: typeof payload.state === "string" ? payload.state : undefined,
      accessToken: typeof payload.accessToken === "string" ? payload.accessToken : undefined,
      newOauth2: payload.newOauth2 === "google" || payload.newOauth2 === "facebook" ? payload.newOauth2 : undefined,
    };
  } catch {
    return null;
  }
}

export async function setOAuth2Flow(data: OAuth2Flow): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, await sign(data), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function clearOAuth2Flow(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
