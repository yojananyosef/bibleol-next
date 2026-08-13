import { redirect } from "next/navigation";
import { getSession, clearSession } from "./session.ts";
import * as users from "../services/users.ts";
import { DataException, MSG } from "../errors.ts";
import { normalizeLang } from "../languages.ts";

/**
 * Estado del usuario actual de la sesión (solo lectura de BD, como Mod_users::$me).
 * Lanza redirect("/login") si no hay sesión.
 */
export async function currentUser(): Promise<users.UserRow> {
  const session = await getSession();
  if (!session || session.userId <= 0) {
    redirect("/login");
  }
  try {
    const u = users.getUserById(session.userId);
    if ((u.id ?? 0) <= 0) redirect("/login");
    return u;
  } catch (e) {
    if (e instanceof DataException) {
      await clearSession();
      redirect("/login");
    }
    throw e;
  }
}

/** Usuario actual sin redirección (dummyUser si no hay sesión). */
export async function currentUserOrDummy(): Promise<users.UserRow> {
  const session = await getSession();
  if (!session) return users.dummyUser();
  try {
    return users.getUserById(session.userId);
  } catch {
    return users.dummyUser();
  }
}

function guard(u: users.UserRow, ok: boolean, msg: string): void {
  if (!ok) throw new DataException(msg);
}

/** check_logged_in: lanza redirect al login si no logueado. */
export async function checkLoggedIn(): Promise<users.UserRow> {
  return await currentUser();
}

export async function checkLoggedInOrDummy(): Promise<users.UserRow> {
  const u = await currentUserOrDummy();
  guard(u, users.isLoggedIn(u), MSG.mustBeLoggedIn);
  return u;
}

export async function checkTeacher(): Promise<users.UserRow> {
  const u = await currentUser();
  guard(u, users.isTeacher(u), MSG.mustBeTeacher);
  return u;
}

export async function checkAdmin(): Promise<users.UserRow> {
  const u = await currentUser();
  guard(u, users.isAdmin(u), MSG.mustBeAdmin);
  return u;
}

export async function checkTranslator(): Promise<users.UserRow> {
  const u = await currentUser();
  guard(u, users.isTranslator(u), MSG.mustBeTranslator);
  return u;
}

/** check_logged_in_local: logueado y con cuenta local (no OAuth2). */
export async function checkLoggedInLocal(): Promise<users.UserRow> {
  const u = await currentUser();
  if (!users.isLoggedIn(u)) throw new DataException(MSG.mustBeLoggedIn);
  if (u.oauth2_login) throw new DataException(`must_not_be_${u.oauth2_login}`);
  return u;
}

/** check_logged_in_oauth2(authority): logueado con esa autoridad OAuth2. */
export async function checkLoggedInOauth2(authority: "google" | "facebook"): Promise<users.UserRow> {
  const u = await currentUser();
  if (!users.isLoggedIn(u)) throw new DataException(MSG.mustBeLoggedIn);
  if (u.oauth2_login !== authority) throw new DataException(`must_be_${authority}`);
  return u;
}

/** Idioma de la sesión (preferencia del usuario) con fallback "en". */
export async function sessionLanguage(): Promise<string> {
  const session = await getSession();
  return normalizeLang(session?.language || "en");
}
