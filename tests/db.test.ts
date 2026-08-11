import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-test-"));
let dbCounter = 0;

function openTestDb(): Database.Database {
  const db = new Database(path.join(TMP, `app-${dbCounter++}.db`));
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(path.join(process.cwd(), "db", "schema.sqlite.sql"), "utf8"));
  return db;
}

let db: Database.Database;

before(() => {
  db = openTestDb();
});

after(() => {
  db.close();
});

test("esquema: 35 tablas bol_* presentes", () => {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'bol\\_%' ESCAPE '\\'")
    .all() as { name: string }[];
  assert.equal(rows.length, 35);
});

test("seeds del bolsetup.sql migrados 1:1", () => {
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_alphabet").get() as { n: number }).n, 4);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_font").get() as { n: number }).n, 4);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_translation_languages").get() as { n: number }).n, 11);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_lexicon_Hebrew").get() as { n: number }).n, 10085);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_lexicon_greek").get() as { n: number }).n, 5433);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_lexicon_latin").get() as { n: number }).n, 4581);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_lexicon_Aramaic").get() as { n: number }).n, 800);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_lexicon_latin2").get() as { n: number }).n, 76);
  assert.equal((db.prepare("SELECT * FROM bol_migrations").get() as { version: number }).version, 19);
});

test("hash de contraseña idéntico al PHP (md5(salt+pw))", async () => {
  const { createHash } = await import("node:crypto");
  const md5 = (s: string) => createHash("md5").update(s).digest("hex");
  const { getConfig, hashPassword } = await import("../src/lib/config.ts");
  const salt = getConfig().pw_salt;
  for (const pw of ["student", "admin", "secret-password"]) {
    assert.equal(hashPassword(salt, pw), md5(salt + pw));
  }
});

test("FKs: bol_userclass cascade on user delete", () => {
  const uid = db.prepare("INSERT INTO bol_user (first_name,last_name,username,password,isadmin,created_time,preflang) VALUES ('A','B','fkuser','x',0,0,'en')").run().lastInsertRowid as number;
  const cid = db.prepare("INSERT INTO bol_class (classname,ownerid) VALUES ('C',?)").run(uid).lastInsertRowid as number;
  db.prepare("INSERT INTO bol_userclass (userid,classid,access) VALUES (?,?,1)").run(uid, cid);
  db.prepare("DELETE FROM bol_user WHERE id=?").run(uid);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_userclass WHERE userid=?").get(uid) as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_class WHERE id=?").get(cid) as { n: number }).n, 1);
});

test("bol_exam encadena a bol_exam_active con cascade", () => {
  const uid = db.prepare("INSERT INTO bol_user (first_name,last_name,username,password,isadmin,created_time,preflang) VALUES ('A','B','fkuser2','x',0,0,'en')").run().lastInsertRowid as number;
  const eid = db.prepare("INSERT INTO bol_exam (exam_name,ownerid,examcode,examcodehash) VALUES ('Ex',?,'<xml/>','h')").run(uid).lastInsertRowid as number;
  const aid = db.prepare("INSERT INTO bol_exam_active (exam_name,class_id,exam_start_time,exam_end_time,exam_id,instance_name) VALUES ('Ex',1,0,100,?,'I')").run(eid).lastInsertRowid as number;
  db.prepare("DELETE FROM bol_exam WHERE id=?").run(eid);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_exam_active WHERE id=?").get(aid) as { n: number }).n, 0);
});

test("datos demo del migrate-schema (usuarios, clase, enrollment)", async () => {
  const { seedDemoData } = await import("../src/lib/db/seed.ts");
  const db2 = openTestDb();
  const res = seedDemoData(db2);
  assert.equal(res.users, 3);
  assert.equal(res.classes, 1);
  const users = db2.prepare("SELECT username, isadmin, isteacher, istranslator FROM bol_user WHERE username IN ('admin','teacher','student')").all() as { username: string; isadmin: number; isteacher: number; istranslator: number }[];
  assert.equal(users.length, 3);
  const student = users.find((u) => u.username === "student")!;
  assert.equal(student.isadmin, 0);
  const cls = db2.prepare("SELECT c.id FROM bol_class c JOIN bol_user u ON u.id=c.ownerid WHERE u.username='teacher'").get() as { id: number } | undefined;
  assert.ok(cls);
  const enrolled = db2
    .prepare("SELECT COUNT(*) n FROM bol_userclass uc JOIN bol_user u ON u.id=uc.userid WHERE u.username='student' AND uc.classid=?")
    .get(cls.id) as { n: number } | undefined;
  assert.equal(enrolled!.n, 1);
  const hash = (db2.prepare("SELECT password FROM bol_user WHERE username='student'").get() as { password: string }).password;
  const { hashPassword, md5Hex } = await import("../src/lib/db/seed.ts");
  assert.equal(hash, hashPassword("xxxxxxx", "student"));
  assert.equal(hash, md5Hex("xxxxxxxstudent"));
  db2.close();
});
