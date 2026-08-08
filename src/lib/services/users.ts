import { randomBytes } from "node:crypto";
import { getAppDb } from "../db/sqlite.ts";
import { DataException } from "../errors.ts";
import { hashPassword } from "../auth/password.ts";

/**
 * Port 1:1 de Mod_users.php (550 líneas).
 * Un usuario "dummy" con id=0 representa "no logueado" (make_dummy_user).
 */

/** 2017-12-04 — la política actual se considera aceptada si accept_policy >= esta fecha. */
export const CURRENT_POLICY_DATE = 1512390210;
export const ACCEPT_CODE_EXPIRY = 15 * 60; // 15 minutos
export const RESET_KEY_EXPIRY = 48 * 3600; // 48 horas

export interface UserRow {
  id: number | null;
  first_name: string;
  last_name: string;
  username: string;
  password: string;
  reset: string | null;
  reset_time: number;
  isadmin: number;
  email: string | null;
  oauth2_login: string | null;
  created_time: number;
  last_login: number;
  warning_sent: number;
  isteacher: number;
  preflang: string;
  prefvariant: string;
  family_name_first: number;
  istranslator: number;
  accept_policy: number;
  policy_lang: string | null;
  acc_code: string | null;
  acc_code_time: number;
}

/** make_dummy_user() — estructura vacía con id=0. */
export function dummyUser(): UserRow {
  return {
    id: 0, first_name: "", last_name: "", username: "", password: "", reset: null,
    reset_time: 0, isadmin: 0, email: "", oauth2_login: "", created_time: 0, last_login: 0,
    warning_sent: 0, isteacher: 0, preflang: "", prefvariant: "", family_name_first: 0,
    istranslator: 0, accept_policy: 0, policy_lang: "", acc_code: "", acc_code_time: 0,
  };
}

/** Nuevo usuario sin id (id=null indica "nuevo", como get_user_by_id(-1)). */
export type NewUserRow = UserRow;

export function newUser(): NewUserRow {
  const u = dummyUser() as NewUserRow;
  u.id = null;
  u.created_time = Math.floor(Date.now() / 1000);
  u.last_login = u.created_time - 10;
  u.preflang = "none";
  u.prefvariant = "";
  return u;
}

export function makeFullName(u: Pick<UserRow, "first_name" | "last_name" | "family_name_first">): string {
  if (u.family_name_first) return `${u.last_name}${u.first_name}`;
  if (!u.first_name) return u.last_name;
  if (!u.last_name) return u.first_name;
  return `${u.first_name} ${u.last_name}`;
}

/** teacher_cmp del PHP: orden por last_name, luego first_name. */
export function cmpTeachers(a: UserRow, b: UserRow): number {
  if (a.last_name < b.last_name) return -1;
  if (a.last_name > b.last_name) return 1;
  if (a.first_name < b.first_name) return -1;
  if (a.first_name > b.first_name) return 1;
  return 0;
}

export function acceptedCurrentPolicy(u: Pick<UserRow, "accept_policy">): boolean {
  return u.accept_policy >= CURRENT_POLICY_DATE;
}

const SELECT_USER = `SELECT id, first_name, last_name, username, password, reset, reset_time, isadmin, email,
  oauth2_login, created_time, last_login, warning_sent, isteacher, preflang, prefvariant, family_name_first,
  istranslator, accept_policy, policy_lang, acc_code, acc_code_time FROM bol_user`;

function rowToUser(row: UserRow): UserRow {
  return { ...dummyUser(), ...row } as UserRow;
}

export function getUserById(userid: number): UserRow | NewUserRow {
  if (userid === -1) return newUser();
  const row = getAppDb().prepare(`${SELECT_USER} WHERE id=?`).get(userid) as UserRow | undefined;
  if (!row) throw new DataException("illegal_user_id");
  return rowToUser(row);
}

/** True si login correcto (username + md5(salt+pw)); null/false si no. */
export function verifyLogin(name: string, pw: string): UserRow | null {
  const row = getAppDb().prepare(`${SELECT_USER} WHERE username=? AND password=?`).get(name, hashPassword(pw)) as UserRow | undefined;
  if (!row) return null;
  return rowToUser(row);
}

export function updateLoginStat(u: UserRow): void {
  const now = Math.floor(Date.now() / 1000);
  getAppDb()
    .prepare("UPDATE bol_user SET last_login=?, warning_sent=0 WHERE id=?")
    .run(now, u.id);
  u.last_login = now;
  u.warning_sent = 0;
}

// ---- Roles (todas exigen aceptar la política actual) ----

export function isAdmin(u: UserRow): boolean {
  return !!u.isadmin && acceptedCurrentPolicy(u);
}

export function isTeacher(u: UserRow): boolean {
  return (!!u.isteacher || !!u.isadmin) && acceptedCurrentPolicy(u);
}

export function isTranslator(u: UserRow): boolean {
  return (!!u.istranslator || !!u.isadmin) && acceptedCurrentPolicy(u);
}

export function isLoggedIn(u: UserRow): boolean {
  return (u.id ?? 0) > 0 && acceptedCurrentPolicy(u);
}

export function isLoggedInNoAccept(u: UserRow): boolean {
  return (u.id ?? 0) > 0 && !acceptedCurrentPolicy(u);
}

/** Todos los admins son profesores de todas las clases. */
export function isTheTeacher(classid: number, userid: number, me: UserRow): boolean {
  const n = getAppDb()
    .prepare("SELECT COUNT(*) AS n FROM bol_class WHERE id=? AND ownerid=?")
    .get(classid, userid) as { n: number };
  return (n.n > 0 || isAdmin(me)) && acceptedCurrentPolicy(me);
}

export function isGrader(classid: number, graderid: number): boolean {
  const n = getAppDb()
    .prepare("SELECT COUNT(*) AS n FROM bol_grader WHERE classid=? AND graderid=?")
    .get(classid, graderid) as { n: number };
  return n.n > 0;
}

export function noName(u: UserRow): boolean {
  return !u.first_name || !u.last_name;
}

export function userFullName(uid: number): string {
  const row = getAppDb()
    .prepare("SELECT first_name, last_name, family_name_first FROM bol_user WHERE id=?")
    .get(uid) as { first_name: string; last_name: string; family_name_first: number } | undefined;
  if (!row) throw new DataException("illegal_user_id");
  return makeFullName(row);
}

// ---- Listado y filtrado ----

export const USER_ORDERBY_FIELDS = ["username", "first_name", "last_name", "email", "last_login", "isteacher", "isadmin", "istranslator"] as const;

export function getUsersPart(limit: number, offset: number, orderby: string, sortorder: "asc" | "desc"): UserRow[] {
  const col = USER_ORDERBY_FIELDS.includes(orderby as (typeof USER_ORDERBY_FIELDS)[number]) ? orderby : "username";
  const dir = sortorder === "desc" ? "DESC" : "ASC";
  const rows = getAppDb()
    .prepare(`${SELECT_USER} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`)
    .all(limit, offset) as UserRow[];
  return rows.map(rowToUser);
}

export function filterUsers(f: { username?: string; first_name?: string; last_name?: string; email?: string }): UserRow[] {
  const db = getAppDb();
  const where: string[] = [];
  const params: string[] = [];
  for (const [col, val] of Object.entries(f)) {
    if (val) {
      where.push(`${col} LIKE ?`);
      params.push(`%${val}%`);
    }
  }
  const sql = `${SELECT_USER}${where.length ? " WHERE " + where.join(" AND ") : ""}`;
  const rows = db.prepare(sql).all(...params) as UserRow[];
  return rows.map(rowToUser);
}

export function countUsers(): number {
  return (getAppDb().prepare("SELECT COUNT(*) AS count FROM bol_user").get() as { count: number }).count;
}

export function getTeachers(): UserRow[] {
  const rows = getAppDb()
    .prepare(`${SELECT_USER} WHERE isteacher=1 OR isadmin=1`)
    .all() as UserRow[];
  return rows.map(rowToUser).sort(cmpTeachers);
}

// ---- Búsqueda por nombre/email (sign-up de profesor) ----

/** Null si no encontrado; UserRow si uno; UserRow[] si varios (mismo email). */
export function getUserByNameOrEmail(username: string, email: string): UserRow | UserRow[] | null {
  const db = getAppDb();
  if (username) {
    const row = db
      .prepare(`${SELECT_USER} WHERE username=? AND oauth2_login!='google' AND oauth2_login!='facebook'`)
      .get(username) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }
  const rows = db
    .prepare(`${SELECT_USER} WHERE email=? AND oauth2_login!='google' AND oauth2_login!='facebook'`)
    .all(email) as UserRow[];
  if (rows.length === 1) return rowToUser(rows[0]);
  if (rows.length > 1) return rows.map(rowToUser);
  return null;
}

// ---- Reset de contraseña ----

export function getUserByResetKey(resetKey: string): UserRow | null {
  const row = getAppDb().prepare(`${SELECT_USER} WHERE reset=?`).get(resetKey) as UserRow | undefined;
  if (!row) return null;
  const u = rowToUser(row);
  const now = Math.floor(Date.now() / 1000);
  if (now - u.reset_time > RESET_KEY_EXPIRY) return null;
  return u;
}

export function setResetKey(u: UserRow, resetKey: string): void {
  getAppDb()
    .prepare("UPDATE bol_user SET reset=?, reset_time=? WHERE id=?")
    .run(resetKey, Math.floor(Date.now() / 1000), u.id);
  u.reset = resetKey;
}

// ---- Insert/update/delete (set_user del PHP) ----

export function setUser(u: UserRow, pw?: string): void {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  const data = {
    first_name: u.first_name ?? "",
    last_name: u.last_name ?? "",
    username: u.username ?? "",
    password: pw ? hashPassword(pw) : u.password,
    reset: u.reset ?? null,
    reset_time: u.reset_time ?? 0,
    isadmin: u.isadmin ? 1 : 0,
    email: u.email ?? null,
    oauth2_login: u.oauth2_login ?? null,
    created_time: u.created_time ?? now,
    last_login: u.last_login ?? 0,
    warning_sent: u.warning_sent ?? 0,
    isteacher: u.isteacher ? 1 : 0,
    preflang: u.preflang ?? "none",
    prefvariant: u.prefvariant ?? "",
    family_name_first: u.family_name_first ? 1 : 0,
    istranslator: u.istranslator ? 1 : 0,
    accept_policy: u.accept_policy ?? 0,
    policy_lang: u.policy_lang ?? null,
    acc_code: u.acc_code ?? null,
    acc_code_time: u.acc_code_time ?? 0,
  };
  if (u.id === null || u.id === undefined) {
    const res = db
      .prepare(
        `INSERT INTO bol_user (first_name, last_name, username, password, reset, reset_time, isadmin, email, oauth2_login,
          created_time, last_login, warning_sent, isteacher, preflang, prefvariant, family_name_first, istranslator,
          accept_policy, policy_lang, acc_code, acc_code_time)
         VALUES (@first_name, @last_name, @username, @password, @reset, @reset_time, @isadmin, @email, @oauth2_login,
          @created_time, @last_login, @warning_sent, @isteacher, @preflang, @prefvariant, @family_name_first,
          @istranslator, @accept_policy, @policy_lang, @acc_code, @acc_code_time)`
      )
      .run(data);
    u.id = Number(res.lastInsertRowid);
  } else {
    db.prepare(
      `UPDATE bol_user SET first_name=@first_name, last_name=@last_name, username=@username, password=@password,
        reset=@reset, reset_time=@reset_time, isadmin=@isadmin, email=@email, oauth2_login=@oauth2_login,
        created_time=@created_time, last_login=@last_login, warning_sent=@warning_sent, isteacher=@isteacher,
        preflang=@preflang, prefvariant=@prefvariant, family_name_first=@family_name_first, istranslator=@istranslator,
        accept_policy=@accept_policy, policy_lang=@policy_lang, acc_code=@acc_code, acc_code_time=@acc_code_time
       WHERE id=@id`
    ).run({ ...data, id: u.id });
  }
}

export function deleteUser(userid: number): void {
  const db = getAppDb();
  const res = db.prepare("DELETE FROM bol_user WHERE id=?").run(userid);
  if (res.changes === 0) throw new DataException("illegal_user_id");
  db.prepare("DELETE FROM bol_font WHERE user_id=?").run(userid);
  db.prepare("UPDATE bol_exerciseowner SET ownerid=0 WHERE ownerid=?").run(userid);
}

// ---- OAuth2 (Ctrl_oauth2, Fase 9; port lógico ahora) ----

/** True si es la primera vez que el usuario OAuth2 entra. */
export function newOauth2User(
  authority: "google" | "facebook",
  oauth2UserId: string,
  firstName: string,
  lastName: string,
  familyNameFirst: boolean,
  email: string | null
): UserRow & { id: number } | null {
  const db = getAppDb();
  const username = authority === "google" ? `ggl_${oauth2UserId}` : `fcb_${oauth2UserId}`;
  const row = db.prepare(`${SELECT_USER} WHERE oauth2_login=? AND username=?`).get(authority, username) as UserRow | undefined;
  if (row) {
    const u = rowToUser(row);
    if (firstName !== u.first_name || lastName !== u.last_name || email !== u.email) {
      db.prepare("UPDATE bol_user SET first_name=?, last_name=?, email=? WHERE id=?").run(
        firstName, lastName, email ?? null, u.id
      );
      u.first_name = firstName; u.last_name = lastName; u.email = email ?? "";
    }
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const u = newUser();
  u.first_name = firstName;
  u.last_name = lastName;
  u.family_name_first = familyNameFirst ? 1 : 0;
  u.username = username;
  u.password = "NONE";
  u.email = email ?? null;
  u.oauth2_login = authority;
  u.created_time = now;
  u.last_login = now;
  u.preflang = "en";
  setUser(u);
  return u as UserRow & { id: number };
}

// ---- Expiración de cuentas (cron) ----

export function deleteNewInactive(time: number): UserRow[] {
  const now = Math.floor(Date.now() / 1000);
  const rows = getAppDb()
    .prepare(`${SELECT_USER} WHERE last_login=0 AND created_time>0 AND created_time<?`)
    .all(now - time) as UserRow[];
  const users = rows.map(rowToUser);
  for (const u of users) deleteUser(u.id!);
  return users;
}

/** level==0: borrar; level!=0: marcar warning_sent=level. */
export function oldInactive(level: number, time: number): UserRow[] {
  const now = Math.floor(Date.now() / 1000);
  const db = getAppDb();
  if (level === 0) {
    const rows = db.prepare(`${SELECT_USER} WHERE last_login<? AND last_login>0`).all(now - time) as UserRow[];
    const users = rows.map(rowToUser);
    for (const u of users) deleteUser(u.id!);
    return users;
  }
  const rows = db
    .prepare(`${SELECT_USER} WHERE last_login<? AND last_login>0 AND warning_sent<?`)
    .all(now - time, level) as UserRow[];
  db.prepare("UPDATE bol_user SET warning_sent=? WHERE last_login<? AND last_login>0 AND warning_sent<?").run(
    level, now - time, level
  );
  return rows.map(rowToUser);
}

// ---- Política de privacidad ----

export function generateAcceptanceCode(u: UserRow): string {
  const accCode = randomBytes(16).toString("hex");
  u.acc_code = accCode;
  u.acc_code_time = Math.floor(Date.now() / 1000);
  getAppDb()
    .prepare("UPDATE bol_user SET acc_code=?, acc_code_time=? WHERE id=?")
    .run(accCode, u.acc_code_time, u.id);
  return accCode;
}

/** True si el código es correcto y vigente; si setMe, fija accept_policy y actualiza BD. */
export function verifyAcceptCode(u: UserRow, accCode: string, policyLang: string, setMe: boolean): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (u.acc_code === accCode && now - u.acc_code_time < ACCEPT_CODE_EXPIRY) {
    if (setMe) {
      u.accept_policy = now;
      u.policy_lang = policyLang;
      getAppDb()
        .prepare("UPDATE bol_user SET accept_policy=?, policy_lang=? WHERE id=?")
        .run(now, policyLang, u.id);
    }
    return true;
  }
  return false;
}

// ---- CLI (generate_administrator / generate_student) ----

export function generateAdministrator(username: string, first: string, last: string, pw: string): number {
  const db = getAppDb();
  const existing = db.prepare("SELECT id FROM bol_user WHERE username=?").get(username) as { id: number } | undefined;
  if (existing) return existing.id;
  const now = Math.floor(Date.now() / 1000);
  const u = newUser();
  u.first_name = first; u.last_name = last; u.family_name_first = 0;
  u.username = username; u.isadmin = 1; u.created_time = now; u.last_login = now;
  u.preflang = "none"; u.prefvariant = "none";
  setUser(u, pw);
  return u.id!;
}

export function generateStudent(username: string, first: string, last: string, pw: string): number {
  const db = getAppDb();
  const existing = db.prepare("SELECT id FROM bol_user WHERE username=?").get(username) as { id: number } | undefined;
  if (existing) return existing.id;
  const now = Math.floor(Date.now() / 1000);
  const u = newUser();
  u.first_name = first; u.last_name = last; u.family_name_first = 0;
  u.username = username; u.isadmin = 0; u.created_time = now; u.last_login = now;
  u.preflang = "none"; u.prefvariant = "none";
  setUser(u, pw);
  return u.id!;
}
