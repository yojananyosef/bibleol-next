import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import type { UserRow } from "../src/lib/services/users.ts";
import type { ClassRow, ClassInfo } from "../src/lib/services/classes.ts";

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-classes-"));
process.env.BIBLEOL_DATA_DIR = TMP;

// FASE 6 — clases y usuario-clase: port de Mod_classes.php + Mod_userclass.php
// (CRUD de clases, ownership/grader, matrícula, acceso, enrol_before).

let db: Database.Database;
let cls: typeof import("../src/lib/services/classes.ts");
let uc: typeof import("../src/lib/services/userclass.ts");

let me: UserRow; // profesor
let me2: UserRow; // segundo profesor
let student: UserRow;

before(async () => {
  const { getAppDb } = await import("../src/lib/db/sqlite.ts");
  cls = await import("../src/lib/services/classes.ts");
  uc = await import("../src/lib/services/userclass.ts");
  db = getAppDb();

  const mk = (username: string, isteacher: number): UserRow => {
    const id = db
      .prepare(
        "INSERT INTO bol_user (first_name, last_name, username, password, isadmin, isteacher, preflang, accept_policy) VALUES (?, ?, ?, 'x', 0, ?, 'en', 9999999999)",
      )
      .run("Test", username, username, isteacher).lastInsertRowid as number;
    return db.prepare("SELECT * FROM bol_user WHERE id = ?").get(id) as UserRow;
  };
  me = mk("teacher1", 1);
  me2 = mk("teacher2", 1);
  student = mk("student1", 0);
});

after(() => {
  db.close();
});

function freshClass(ownerid: number, classname: string): ClassInfo {
  return { id: null, classname, password: "", enrol_before: "", ownerid, priority: 0 };
}

test("setClass: inserta y borra clase (deleteClass limpia userclass/classexercise)", () => {
  cls.setClass(freshClass(me.id ?? 0, "Arameo y hebreo"));
  const row = db.prepare("SELECT * FROM bol_class WHERE classname = ?").get("Arameo y hebreo") as ClassRow;
  assert.ok(row.id > 0);
  assert.equal(row.password, null, "password vacío se guarda como NULL");
  assert.equal(row.ownerid, me.id);

  // limpia filas dependientes al borrar
  uc.enrollUserInClass(student.id ?? 0, row.id);
  db.prepare("INSERT INTO bol_classexercise (classid, pathid) VALUES (?, 1)").run(row.id);
  cls.deleteClass(row.id);
  assert.equal(
    (db.prepare("SELECT COUNT(*) n FROM bol_userclass WHERE classid = ?").get(row.id) as { n: number }).n,
    0,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) n FROM bol_classexercise WHERE classid = ?").get(row.id) as { n: number }).n,
    0,
  );
  assert.throws(() => cls.deleteClass(row.id), (e: unknown) => (e as Error).message === cls.MSG_CLASSES.illegalClassId);
});

test("setClass: actualiza y getClassById(-1) crea clase nueva", () => {
  cls.setClass({ ...freshClass(me.id ?? 0, "Editar esta"), id: -1 });
  const created = db.prepare("SELECT * FROM bol_class WHERE classname = 'Editar esta'").get() as ClassRow;
  cls.setClass({
    id: created.id,
    classname: "Editada",
    password: "secreta",
    enrol_before: "2099-12-31",
    ownerid: (me.id ?? 0),
    priority: 1,
  });
  const updated = db.prepare("SELECT * FROM bol_class WHERE id = ?").get(created.id) as ClassRow;
  assert.equal(updated.classname, "Editada");
  assert.equal(updated.password, "secreta");
  assert.equal(updated.priority, 1);

  const fresh = cls.getClassById(-1, me);
  assert.equal(fresh.ownerid, me.id, "nueva clase la posee el profesor actual");
  assert.throws(() => cls.getClassById(9999, me), (e: unknown) => (e as Error).message === cls.MSG_CLASSES.illegalClassId);
});

test("getAllClasses: join con owner (uid) y alias clid/clpass", () => {
  cls.setClass(freshClass(me.id ?? 0, "Join owner"));
  const all = cls.getAllClasses();
  const row = all.find((c) => c.classname === "Join owner");
  assert.ok(row, "clase presente");
  assert.equal(row!.clid, row!.id);
  assert.equal(row!.uid, me.id, "uid = id del owner vía join");
  // todas las filas tienen clid único (mapa por id en el legacy)
  assert.equal(new Set(all.map((c) => c.clid)).size, all.length);
});

test("ownership y grader: getClassesOwned/getNamedClassesOwned", () => {
  const c1 = cls.setClass(freshClass(me.id ?? 0, "Propia de 1"));
  const c2 = cls.setClass(freshClass(me2.id ?? 0, "Propia de 2"));

  // getClassesOwned: solo las de me (no las de me2)
  const owned1 = cls.getClassesOwned(me, false);
  assert.ok(owned1.includes(c1), "posee su clase");
  assert.ok(!owned1.includes((db.prepare("SELECT id FROM bol_class WHERE classname='Propia de 2'").get() as ClassRow).id), "no posee la de me2");

  // me es grader de la clase de me2 → aparece en getNamedClassesOwned(me)
  db.prepare("INSERT INTO bol_grader (graderid, classid) VALUES (?, ?)").run(me.id, c2);
  const named = cls.getNamedClassesOwned(me, false);
  assert.ok(named.some((c) => c.classname === "Propia de 2"), "clase de me2 visible como grader");
  assert.ok(named.some((c) => c.classname === "Propia de 1"), "clase propia visible");
  const dup = named.filter((c) => c.classname === "Propia de 2");
  assert.equal(dup.length, 1, "sin duplicados por grader");

  // admin con all=true ve todas
  const asAdmin = { ...me, isadmin: 1 } as UserRow;
  assert.deepEqual(
    cls.getClassesOwned(asAdmin, true).length,
    (db.prepare("SELECT COUNT(*) n FROM bol_class").get() as { n: number }).n,
  );
});

test("chownClass: transfiere a otro profesor, rechaza a un estudiante", () => {
  cls.setClass(freshClass(me.id ?? 0, "Para transferir"));
  const cid = (db.prepare("SELECT id FROM bol_class WHERE classname='Para transferir'").get() as ClassRow).id;
  cls.chownClass(cid, me2.id ?? 0);
  assert.equal((db.prepare("SELECT ownerid FROM bol_class WHERE id = ?").get(cid) as { ownerid: number }).ownerid, me2.id);
  assert.throws(() => cls.chownClass(cid, student.id ?? 0), (e: unknown) => (e as Error).message === cls.MSG_CLASSES.notTeacher);
});

test("enroll: enrollIn valida password de clase y enrol_before", () => {
  const cid = cls.setClass({ id: -1, classname: "Con password", password: "abc", enrol_before: "", ownerid: me.id ?? 0, priority: 0 });
  // password incorrecto
  assert.throws(() => uc.enrollIn(student.id ?? 0, cid, "nope"), (e: unknown) => (e as Error).message === uc.MSG_USERCLASS.wrongClassPassword);
  // correcto → matriculado
  uc.enrollIn(student.id ?? 0, cid, "abc");
  assert.ok(uc.getClassesForUser(student.id ?? 0).includes(cid));
  // ya matriculado
  assert.throws(() => uc.enrollIn(student.id ?? 0, cid, "abc"), (e: unknown) => (e as Error).message === uc.MSG_USERCLASS.alreadyEnrolled);
  // enrol_before en el pasado → no disponible en enrollAvailability
  const past = cls.setClass({ id: -1, classname: "Caducada", password: "", enrol_before: "2000-01-01", ownerid: me.id ?? 0, priority: 0 });
  uc.enrollUserInClass(student.id ?? 0, past);
  assert.ok(!uc.enrollAvailability(student).availClasses.includes(past));
  // sin password → matrícula directa
  const open = cls.setClass({ id: -1, classname: "Abierta", password: "", enrol_before: "", ownerid: me.id ?? 0, priority: 1 });
  const avail = uc.enrollAvailability(me2);
  assert.ok(avail.priorityClasses.includes(open), "prioritarias listadas");
  assert.ok(avail.noPriorityClasses.includes(cid), "normales listadas");
  assert.ok(avail.availClasses.indexOf(open) < avail.availClasses.indexOf(cid), "prioritarias primero");
});

test("updateUsersInClass/updateClassesForUser: sync bidireccional", () => {
  const cid = cls.setClass({ id: -1, classname: "Sync", password: "", enrol_before: "", ownerid: me.id ?? 0, priority: 0 });
  const student2 = db.prepare("SELECT * FROM bol_user WHERE id = ?").get(
    db.prepare("INSERT INTO bol_user (first_name,last_name,username,password,isadmin,isteacher,preflang,accept_policy) VALUES ('S2','Sync','sync2','x',0,0,'en',9999999999)").run().lastInsertRowid,
  ) as UserRow;

  uc.updateUsersInClass(cid, [], [student.id ?? 0, student2.id ?? 0]);
  assert.deepEqual(uc.getUsersInClass(cid).sort(), [student.id ?? 0, student2.id ?? 0].sort());
  uc.updateUsersInClass(cid, [student.id ?? 0, student2.id ?? 0], [student.id ?? 0]);
  assert.deepEqual(uc.getUsersInClass(cid), [student.id ?? 0]);

  const owned = cls.getClassesOwned(me, false);
  uc.updateClassesForUser(student2.id ?? 0, [], [cid], owned);
  assert.ok(uc.getClassesForUser(student2.id ?? 0).includes(cid));
});

test("manageAccess/unenrollFrom/gaveAccess/changeAccess", () => {
  const cid = cls.setClass({ id: -1, classname: "Accesos", password: "", enrol_before: "", ownerid: me.id ?? 0, priority: 0 });
  uc.enrollUserInClass(student.id ?? 0, cid);

  uc.manageAccess(student.id ?? 0, cid, 1);
  const accessRow = db.prepare("SELECT access FROM bol_userclass WHERE userid=? AND classid=?").get(student.id ?? 0, cid) as { access: number };
  assert.equal(accessRow.access, 1);
  assert.equal(uc.gaveAccess(student.id ?? 0, [cid]), 1);
  assert.equal(uc.gaveAccess(student.id ?? 0, []), 0, "sin clases → 0");

  assert.throws(() => uc.manageAccess(student.id ?? 0, 9999, 0), (e: unknown) => (e as Error).message === uc.MSG_USERCLASS.notEnrolled);
  uc.unenrollFrom(student.id ?? 0, cid);
  assert.ok(!uc.getClassesForUser(student.id ?? 0).includes(cid));
  assert.throws(() => uc.unenrollFrom(student.id ?? 0, cid), (e: unknown) => (e as Error).message === uc.MSG_USERCLASS.notEnrolled);
});

test("beforeDate: formato y comparación con hoy (Europe/Copenhagen)", () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(new Date());
  assert.ok(uc.beforeDate(today), "hoy es válida");
  assert.ok(uc.beforeDate("2099-12-31"));
  assert.ok(!uc.beforeDate("2000-01-01"));
  assert.throws(() => uc.beforeDate("01/02/2000"), (e: unknown) => (e as Error).message === "date_invalid_format");
});

test("usersInClass guardas: solo owner/admin modifica", () => {
  const cid = cls.setClass({ id: -1, classname: "Guardas", password: "", enrol_before: "", ownerid: me.id ?? 0, priority: 0 });
  // otro profesor no es owner
  assert.throws(() => uc.usersInClass(cid, me2), (e: unknown) => (e as Error).message === uc.MSG_USERCLASS.notClassOwner);
  assert.throws(() => uc.usersInClass(0, me), (e: unknown) => (e as Error).message === uc.MSG_USERCLASS.illegalClassId);
  // admin sí
  const asAdmin = { ...me2, isadmin: 1 } as UserRow;
  const data = uc.usersInClass(cid, asAdmin);
  assert.equal(data.classInfo.classname, "Guardas");
  assert.ok(Array.isArray(data.allUsers) && Array.isArray(data.oldUsers));
});