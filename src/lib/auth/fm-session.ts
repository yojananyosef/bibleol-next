import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

/**
 * Sesión de copiar/mover ficheros (files/operation/from_dir de la sesión CI).
 * Cookie httpOnly aparte de ol_session, firmada con jose (mismo secreto).
 */

export interface FmSessionData {
  files: string[];
  operation: "copy" | "move";
  fromDir: string;
}

const COOKIE_NAME = "ol_fm";
const MAX_AGE = 24 * 3600;

function sessionSecret(): Uint8Array {
  const secret = process.env.BIBLEOL_SESSION_SECRET ?? "dev-only-secret-change-me";
  return new TextEncoder().encode(secret);
}

/** Lee la operación copy/move pendiente (null si no hay cookie válida). */
export async function getFmSession(): Promise<FmSessionData | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (!Array.isArray(payload.files) || typeof payload.op !== "string" || typeof payload.from !== "string")
      return null;
    return {
      files: payload.files.filter((f): f is string => typeof f === "string"),
      operation: payload.op === "move" ? "move" : "copy",
      fromDir: payload.from,
    };
  } catch {
    return null;
  }
}

/** Escribe la cookie de copiar/mover. */
export async function setFmSession(data: FmSessionData): Promise<void> {
  const jar = await cookies();
  const token = await new SignJWT({ files: data.files, op: data.operation, from: data.fromDir })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + MAX_AGE)
    .sign(sessionSecret());
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

/** Borra la cookie de copiar/mover. */
export async function clearFmSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}