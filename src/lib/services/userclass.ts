/**
 * services/userclass.ts — Réplica 1:1 de `models/Mod_userclass.php` (110 líneas).
 * Relación usuarios ↔ clases: matriculación, desmatriculación, acceso y
 * utilidades de listado (1:1 con Mod_userclass + Ctrl_userclass).
 */

import { getAppDb } from "../db/sqlite.ts";
import { DataException } from "../errors.ts";
import { getAllClasses, getClassById, getClassesOwned, type ClassRow } from "./classes.ts";
import { isAdmin, type UserRow } from "./users.ts";

export const MSG_USERCLASS = {
  illegalClassId: "illegal_class_id",
  illegalUserId: "illegal_user_id",
  notClassOwner: "not_class_owner",
  notEnrolled: "not_enrolled",
  alreadyEnrolled: "already_enrolled",
  cannotEnroll: "cannot_enroll",
  wrongClassPassword: "wrong_class_password",
  missingFolderName: "missing_folder_name",
  folderNotEnroll: "folder_not_enroll",
  noClassEnroll: "no_class_enroll",
} as const;

/** get_users_in_class — ids de los usuarios matriculados en la clase. */
export function getUsersInClass(classid: number): number[] {
  const db = getAppDb();
  const rows = db.prepare("SELECT userid FROM bol_userclass WHERE classid = ?").all(classid) as {
    userid: number;
  }[];
  return rows.map((r) => r.userid);
}

/** get_named_users_in_class — usuarios con nombre completo (family_name_first). */
export function getNamedUsersInClass(classid: number): Array<{ userid: number; name: string }> {
  const db = getAppDb();
  return db
    .prepare(
      "SELECT userid, " +
        "CASE WHEN family_name_first THEN last_name || first_name ELSE first_name || ' ' || last_name END AS name " +
        "FROM bol_userclass uc JOIN bol_user u ON u.id = uc.userid " +
        "WHERE classid = ?",
    )
    .all(classid) as Array<{ userid: number; name: string }>;
}

/** update_users_in_class — matricula/desmatricula para igualar old→new. */
export function updateUsersInClass(classid: number, oldUserids: number[], newUserids: number[]): void {
  for (const newid of newUserids) {
    if (oldUserids.includes(newid)) continue;
    enrollUserInClass(newid, classid);
  }
  for (const oldid of oldUserids) {
    if (newUserids.includes(oldid)) continue;
    unenrollUserFromClass(oldid, classid);
  }
}

/** get_classes_for_user — ids de las clases del usuario. */
export function getClassesForUser(userid: number): number[] {
  const db = getAppDb();
  const rows = db.prepare("SELECT classid FROM bol_userclass WHERE userid = ?").all(userid) as {
    classid: number;
  }[];
  return rows.map((r) => r.classid);
}

/** get_classes_and_access_for_user — map classid → access. */
export function getClassesAndAccessForUser(userid: number): Record<number, number> {
  const db = getAppDb();
  const res: Record<number, number> = {};
  for (const row of db.prepare("SELECT classid, access FROM bol_userclass WHERE userid = ?").all(userid) as {
    classid: number;
    access: number;
  }[]) {
    res[row.classid] = row.access;
  }
  return res;
}

/** update_classes_for_user — sincroniza las clases del usuario (solo las owned). */
export function updateClassesForUser(
  userid: number,
  oldClasses: number[],
  newClasses: number[],
  ownedClasses: number[],
): void {
  for (const newid of newClasses) {
    if (oldClasses.includes(newid) || !ownedClasses.includes(newid)) continue;
    enrollUserInClass(userid, newid);
  }
  for (const oldid of oldClasses) {
    if (newClasses.includes(oldid) || !ownedClasses.includes(oldid)) continue;
    unenrollUserFromClass(userid, oldid);
  }
}

/** enroll_user_in_class — matricula al usuario en la clase. */
export function enrollUserInClass(userid: number, classid: number): void {
  const db = getAppDb();
  db.prepare("INSERT INTO bol_userclass (userid, classid) VALUES (?, ?)").run(userid, classid);
}

/** unenroll_user_from_class — desmatricula al usuario de la clase. */
export function unenrollUserFromClass(userid: number, classid: number): void {
  const db = getAppDb();
  db.prepare("DELETE FROM bol_userclass WHERE userid = ? AND classid = ?").run(userid, classid);
}

/** change_access — concede/revoca el acceso del usuario a la clase. */
export function changeAccess(userid: number, classid: number, grant: number): void {
  const db = getAppDb();
  db.prepare("UPDATE bol_userclass SET access = ? WHERE userid = ? AND classid = ?").run(grant, userid, classid);
}

/** gave_access — acceso máximo concedido al usuario entre las clases dadas. */
export function gaveAccess(student: number, classes: number[]): number {
  if (classes.length === 0) return 0;
  const db = getAppDb();
  const ph = classes.map(() => "?").join(",");
  const row = db
    .prepare(`SELECT MAX(access) AS granted FROM bol_userclass WHERE userid = ? AND classid IN (${ph})`)
    .get(student, ...classes) as { granted: number };
  return row.granted;
}

/* ------------------------------------------------------------------ */
/* Lógica de Ctrl_userclass (enroll/manage_access/unenroll + fechas)   */
/* ------------------------------------------------------------------ */

/**
 * before_date — comprueba que la fecha enrol_before (YYYY-MM-DD) no ha
 * pasado (hoy Europe/Copenhagen, 1:1 con Ctrl_userclass::before_date).
 */
export function beforeDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DataException("date_invalid_format");
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" })
    .format(new Date())
    .replaceAll("-", "");
  return ymd <= date.replaceAll("-", "");
}

/** Disponibilidad de matriculación para el usuario (lógica de Ctrl_userclass::enroll). */
export function enrollAvailability(
  me: UserRow,
): { allClasses: ClassRow[]; oldClasses: Record<number, number>; availClasses: number[]; priorityClasses: number[]; noPriorityClasses: number[] } {
  const allClasses = getAllClasses();
  const oldClasses = getClassesAndAccessForUser(me.id ?? 0);
  const priorityClasses: number[] = [];
  const noPriorityClasses: number[] = [];
  for (const ac of allClasses) {
    const enrolled = Object.prototype.hasOwnProperty.call(oldClasses, ac.clid);
    if (!enrolled && (ac.enrol_before === null || ac.enrol_before === "" || beforeDate(ac.enrol_before))) {
      (ac.priority ? priorityClasses : noPriorityClasses).push(ac.clid);
    }
  }
  return {
    allClasses,
    oldClasses,
    availClasses: [...priorityClasses, ...noPriorityClasses],
    priorityClasses,
    noPriorityClasses,
  };
}

/**
 * enroll_in — matricula al usuario tras validar (1:1 Ctrl_userclass::enroll_in).
 * Devuelve la clase en la que se matriculó.
 */
export function enrollIn(userid: number, classid: number, password?: string | null): ClassRow {
  const allClasses = getAllClasses();
  const oldClasses = getClassesForUser(userid);
  if (oldClasses.includes(classid)) throw new DataException(MSG_USERCLASS.alreadyEnrolled);
  const avail = allClasses.find((c) => c.clid === classid);
  if (!avail) throw new DataException(MSG_USERCLASS.cannotEnroll);
  if (avail.clpass && avail.clpass !== password) throw new DataException(MSG_USERCLASS.wrongClassPassword);
  enrollUserInClass(userid, classid);
  return avail;
}

/** manage_access — concede/revoca acceso si el usuario está matriculado. */
export function manageAccess(userid: number, classid: number, grant: number): void {
  if (!getClassesForUser(userid).includes(classid)) throw new DataException(MSG_USERCLASS.notEnrolled);
  changeAccess(userid, classid, grant);
}

/** unenroll_from — desmatricula si el usuario está matriculado. */
export function unenrollFrom(userid: number, classid: number): void {
  if (!getClassesForUser(userid).includes(classid)) throw new DataException(MSG_USERCLASS.notEnrolled);
  unenrollUserFromClass(userid, classid);
}

/** users_in_class — guardas + update de Ctrl_userclass::users_in_class. */
export function usersInClass(classid: number, me: UserRow): { classInfo: ClassRow; allUsers: Array<{ id: number; name: string }>; oldUsers: number[] } {
  if (classid <= 0) throw new DataException(MSG_USERCLASS.illegalClassId);
  const classInfo = getClassById(classid, me);
  if (classInfo.ownerid !== (me.id ?? 0) && !isAdmin(me)) throw new DataException(MSG_USERCLASS.notClassOwner);
  const db = getAppDb();
  const allUsers = db
    .prepare(
      "SELECT id, CASE WHEN family_name_first THEN last_name || first_name ELSE first_name || ' ' || last_name END AS name FROM bol_user",
    )
    .all() as Array<{ id: number; name: string }>;
  allUsers.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { classInfo, allUsers, oldUsers: getUsersInClass(classid) };
}

/** classes_for_user — guardas + datos de Ctrl_userclass::classes_for_user. */
export function classesForUser(
  userid: number,
  me: UserRow,
): { userInfo: UserRow | null; allClasses: ClassRow[]; ownedClasses: number[]; oldClasses: number[] } {
  if (userid <= 0) throw new DataException(MSG_USERCLASS.illegalUserId);
  const allClasses = getAllClasses();
  allClasses.sort((a, b) => (a.classname < b.classname ? -1 : a.classname > b.classname ? 1 : 0));
  return {
    userInfo: makeUserById(userid),
    allClasses,
    ownedClasses: getClassesOwned(me, false),
    oldClasses: getClassesForUser(userid),
  };
}

function makeUserById(userid: number): UserRow | null {
  const db = getAppDb();
  return (db.prepare("SELECT * FROM bol_user WHERE id = ?").get(userid) as UserRow | undefined) ?? null;
}
