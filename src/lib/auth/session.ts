import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

/**
 * Sesión de usuario (reemplaza la sesión CI: 'ol_user', 'language', 'variant').
 * Cookie httpOnly firmada con jose (HS256). El JWT solo lleva el id de usuario,
 * el resto se lee de BD en cada petición (patrón stateless seguro).
 */
export interface SessionData {
  userId: number;
  language: string;
  variant: string;
}

const COOKIE_NAME = "ol_session";
const SESSION_MAX_AGE = 30 * 24 * 3600; // 30 días

function sessionSecret(): Uint8Array {
  const secret = process.env.BIBLEOL_SESSION_SECRET ?? "dev-only-secret-change-me";
  return new TextEncoder().encode(secret);
}

/** Lee la sesión actual (null si no hay cookie válida). */
export async function getSession(): Promise<SessionData | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    const userId = payload.uid;
    if (typeof userId !== "number") return null;
    return {
      userId,
      language: typeof payload.lang === "string" ? payload.lang : "en",
      variant: typeof payload.var === "string" ? payload.var : "",
    };
  } catch {
    return null;
  }
}

/** Escribe la cookie de sesión. */
export async function setSession(data: SessionData): Promise<void> {
  const jar = await cookies();
  const token = await new SignJWT({ uid: data.userId, lang: data.language, var: data.variant })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE)
    .sign(sessionSecret());
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/** Borra la cookie de sesión. */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
