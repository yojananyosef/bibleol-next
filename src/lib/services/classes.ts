/**
 * services/classes.ts — Réplica 1:1 de `models/Mod_classes.php` (151 líneas).
 * CRUD de clases, ownership (owner/grader) y enrol_before.
 * `mod_users->my_id()` se recibe como `me` (convención del proyecto).
 */

import { getAppDb } from "../db/sqlite.ts";
import { DataException } from "../errors.ts";
import { isAdmin, type UserRow } from "./users.ts";

/** Fila de bol_class + alias del join con bol_user (1:1 con get_all_classes). */
export interface ClassRow {
  id: number;
  clid: number;
  classname: string;
  password: string | null;
  enrol_before: string | null;
  ownerid: number;
  priority: number;
  uid: number | null;
  clpass: string | null;
  username?: string | null;
}

/** Datos de una clase para set_class (id null = crear nueva). */
export interface ClassInfo {
  id: number | null;
  classname: string;
  password: string;
  enrol_before: string;
  ownerid: number;
  priority: number;
}

export const MSG_CLASSES = {
  illegalClassId: "illegal_class_id",
  notClassOwner: "not_class_owner",
  notTeacher: "not_teacher",
} as const;

/** get_all_classes — array indexado por clid (join left con el owner). */
export function getAllClasses(): ClassRow[] {
  const db = getAppDb();
  return db
    .prepare(
      "SELECT class.id AS id, class.id AS clid, class.classname, class.password, " +
        "class.password AS clpass, class.enrol_before, class.ownerid, class.priority, " +
        "user.id AS uid, user.username, user.first_name AS ufirst_name, user.last_name AS ulast_name " +
        "FROM bol_class class LEFT JOIN bol_user user ON ownerid = user.id",
    )
    .all() as ClassRow[];
}

/** get_class_by_id — classid === -1 crea una clase nueva con ownerid = me. */
export function getClassById(classid: number, me: UserRow): ClassRow {
  if (classid === -1) {
    return {
      id: -1,
      clid: -1,
      classname: "",
      password: "",
      enrol_before: "",
      ownerid: me.id ?? 0,
      priority: 0,
      uid: me.id,
      clpass: "",
    };
  }
  const db = getAppDb();
  const row = db
    .prepare(
      "SELECT class.id AS id, class.id AS clid, class.classname, class.password, class.password AS clpass, " +
        "class.enrol_before, class.ownerid, class.priority, user.id AS uid, user.username " +
        "FROM bol_class class LEFT JOIN bol_user user ON user.id = class.ownerid WHERE class.id = ?",
    )
    .get(classid) as ClassRow | undefined;
  if (!row) throw new DataException(MSG_CLASSES.illegalClassId);
  return row;
}

/** get_classes_by_ids — clases cuyos ids están en classids. */
export function getClassesByIds(classids: number[]): ClassRow[] {
  if (classids.length === 0) return [];
  const db = getAppDb();
  const ph = classids.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM bol_class WHERE id IN (${ph})`)
    .all(...classids) as ClassRow[];
}

/** get_classes_owned — ids de las clases que posee el usuario (admin: todas). */
export function getClassesOwned(me: UserRow, all = true): number[] {
  const db = getAppDb();
  const rows = (
    all && isAdmin(me)
      ? db.prepare("SELECT id FROM bol_class").all()
      : db.prepare("SELECT id FROM bol_class WHERE ownerid = ?").all(me.id)
  ) as { id: number }[];
  return rows.map((r) => r.id);
}

/** get_named_classes_owned — clases del usuario como owner o grader. */
export function getNamedClassesOwned(me: UserRow, all = true): ClassRow[] {
  const db = getAppDb();
  if (all && isAdmin(me)) {
    return db.prepare("SELECT * FROM bol_class").all() as ClassRow[];
  }
  const owned = db.prepare("SELECT * FROM bol_class WHERE ownerid = ?").all(me.id) as ClassRow[];
  const graderClasses: ClassRow[] = [];
  const graderIds: number[] = [];
  for (const row of db.prepare("SELECT classid FROM bol_grader WHERE graderid = ?").all(me.id) as { classid: number }[]) {
    if (!graderIds.includes(row.classid)) {
      graderIds.push(row.classid);
      const cls = db.prepare("SELECT * FROM bol_class WHERE id = ?").get(row.classid) as ClassRow | undefined;
      if (cls) graderClasses.push(cls);
    }
  }
  return [...owned, ...graderClasses];
}

/** get_named_classes_enrolled — clases en las que el usuario está matriculado. */
export function getNamedClassesEnrolled(me: UserRow): ClassRow[] {
  const db = getAppDb();
  return db
    .prepare(
      "SELECT c.id AS id, c.id AS clid, c.classname, c.password, c.password AS clpass, " +
        "c.enrol_before, c.ownerid, c.priority, u.id AS uid, u.username " +
        "FROM bol_class c JOIN bol_userclass uc ON c.id = uc.classid LEFT JOIN bol_user u ON c.ownerid = u.id " +
        "WHERE uc.userid = ?",
    )
    .all(me.id) as ClassRow[];
}

/** set_class — inserta (id null/‑1) o actualiza (id dado) y devuelve el id. */
export function setClass(info: ClassInfo): number {
  const db = getAppDb();
  const password = info.password === "" ? null : info.password;
  const enrolBefore = info.enrol_before === "" ? null : info.enrol_before;
  if (info.id === null || info.id === -1) {
    return db
      .prepare("INSERT INTO bol_class (classname, password, enrol_before, ownerid, priority) VALUES (?, ?, ?, ?, ?)")
      .run(info.classname, password, enrolBefore, info.ownerid, info.priority).lastInsertRowid as number;
  }
  db.prepare("UPDATE bol_class SET classname = ?, password = ?, enrol_before = ?, ownerid = ?, priority = ? WHERE id = ?").run(
    info.classname,
    password,
    enrolBefore,
    info.ownerid,
    info.priority,
    info.id,
  );
  return info.id;
}

/** delete_class — borra la clase (con userclass/classexercise) o lanza error. */
export function deleteClass(classid: number): void {
  const db = getAppDb();
  const res = db.prepare("DELETE FROM bol_class WHERE id = ?").run(classid);
  if (res.changes === 0) throw new DataException(MSG_CLASSES.illegalClassId);
  db.prepare("DELETE FROM bol_userclass WHERE classid = ?").run(classid);
  db.prepare("DELETE FROM bol_classexercise WHERE classid = ?").run(classid);
}

/** chown_class — transfiere la clase a otro profesor/admin. */
export function chownClass(classid: number, userid: number): void {
  const db = getAppDb();
  const row = db
    .prepare("SELECT id FROM bol_user WHERE id = ? AND (isteacher = 1 OR isadmin = 1)")
    .get(userid) as { id: number } | undefined;
  if (!row) throw new DataException(MSG_CLASSES.notTeacher);
  db.prepare("UPDATE bol_class SET ownerid = ? WHERE id = ?").run(userid, classid);
}
