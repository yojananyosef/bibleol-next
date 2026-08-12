import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import type { UserRow } from "../src/lib/services/users.ts";

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-fm-"));
process.env.BIBLEOL_DATA_DIR = TMP;
cpSync(path.join(process.cwd(), "data", "meta"), path.join(TMP, "meta"), { recursive: true });

// FASE 9 — file manager: métodos de escritura de Mod_quizpath (mkdir/rename/
// rmdir/delete/chown/fix_exerciseowner), Mod_classdir (update_classes_for_dir)
// y los núcleos insert_files / passage_insert (Ctrl_file_manager).

const QUIZZES = path.join(TMP, "quizzes");

let db: Database.Database;
let qpmod: typeof import("../src/lib/services/quizpath.ts");
let tq: typeof import("../src/lib/services/text-quiz.ts");
let me: UserRow;
let meId: number;
let adminId: number;
let studentId: number;
let admin: UserRow;
let student: UserRow;

const mkUser = (username: string, isteacher: number, isadmin: number): UserRow => {
  const id = db
    .prepare(
      "INSERT INTO bol_user (first_name, last_name, username, password, isadmin, isteacher, preflang, accept_policy) VALUES (?, ?, ?, 'x', ?, ?, 'en', 9999999999)",
    )
    .run("Test", username, username, isadmin, isteacher).lastInsertRowid as number;
  return db.prepare("SELECT * FROM bol_user WHERE id = ?").get(id) as UserRow;
};

const writeQuiz = (rel: string, contents: string): void => {
  const full = path.join(QUIZZES, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
};

const readQuiz = (rel: string): string => {
  const full = path.join(QUIZZES, rel);
  if (!existsSync(full)) throw new Error(`missing ${rel}`);
  return readFileSync(full, "utf8");
};

const TEMPLATE_XML = readFileSync(
  path.join(process.cwd(), "data", "quizzes", "ETCBC4", "demo", "demo1.3et"),
  "utf8",
);

before(async () => {
  const { getAppDb } = await import("../src/lib/db/sqlite.ts");
  qpmod = await import("../src/lib/services/quizpath.ts");
  tq = await import("../src/lib/services/text-quiz.ts");
  db = getAppDb();

  me = mkUser("fm_teacher", 1, 0);
  admin = mkUser("fm_admin", 1, 1);
  student = mkUser("fm_student", 0, 0);
  meId = me.id ?? 0;
  adminId = admin.id ?? 0;
  studentId = student.id ?? 0;

  mkdirSync(path.join(QUIZZES, "dir1"), { recursive: true });
  mkdirSync(path.join(QUIZZES, "dir1", "sub"), { recursive: true });
  writeQuiz("dir1/q1.3et", "quiz one");
  writeQuiz("dir1/q2.3et", "quiz two");
  writeQuiz("dir1/sub/s1.3et", TEMPLATE_XML);
  writeQuiz("top.3et", "top quiz");

  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('dir1/q1.3et', ?)").run(meId);
  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('dir1/q2.3et', ?)").run(studentId);
  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('dir1/sub/s1.3et', ?)").run(meId);

  const qp = qpmod.createQuizPath(false);
  qp.init("dir1", true, false, []);
  qpmod.updateClassesForDir("dir1", [], [0, 3]);
});

after(() => {
  // nada que limpiar: dirs temporales
});

const qpFor = (dir: string): ReturnType<typeof qpmod.createQuizPath> => {
  const qp = qpmod.createQuizPath(false);
  qp.init(dir, true, false, []);
  return qp;
};

test("mkdir crea el directorio y falla con 'Cannot create folder'", () => {
  const qp = qpFor("dir1");
  qp.mkdir("newdir");
  assert.ok(existsSync(path.join(QUIZZES, "dir1", "newdir")));
  assert.throws(() => qp.mkdir("bad/name"), /Cannot create folder 'bad\/name'/);
});

test("rename añade .3et, actualiza exerciseowner y falla si ya existe", () => {
  const qp = qpFor("dir1");
  qp.rename("q1", "q1renamed");
  assert.ok(existsSync(path.join(QUIZZES, "dir1", "q1renamed.3et")));
  assert.ok(!existsSync(path.join(QUIZZES, "dir1", "q1.3et")));
  assert.equal(qp.getExerciseOwner("q1renamed.3et"), meId);
  assert.throws(() => qp.rename("q1renamed", "q2"), /'q2\.3et' already exists/);
  assert.throws(() => qp.rename("nonexistent", "x"), /Cannot rename 'nonexistent\.3et' to 'x\.3et'/);
});

test("rmdir borra el directorio vacío y sus registros de clase", () => {
  const qp = qpFor("dir1");
  qp.mkdir("emptydir");
  qpmod.updateClassesForDir("dir1/emptydir", [], [5]);
  qp.rmdir("emptydir");
  assert.ok(!existsSync(path.join(QUIZZES, "dir1", "emptydir")));
  assert.deepEqual(qpmod.getClassesForDir("dir1/emptydir"), []);
  assert.throws(() => qp.rmdir("sub"), /Cannot delete folder 'sub'/); // no está vacío
});

test("checkDeleteFiles: solo owner o admin", () => {
  const qp = qpFor("dir1");
  assert.throws(() => qp.checkDeleteFiles(["q2.3et"], meId, false), /You do not own this file/);
  assert.throws(
    () => qp.checkDeleteFiles(["q1renamed.3et", "q2.3et"], meId, false),
    /You do not own all of the selected files/,
  );
  assert.doesNotThrow(() => qp.checkDeleteFiles(["q2.3et"], studentId, false));
  assert.doesNotThrow(() => qp.checkDeleteFiles(["q2.3et"], meId, true));
});

test("deleteFiles borra fichero y registro de owner", () => {
  const qp = qpFor("dir1");
  assert.throws(() => qp.deleteFiles(["q2.3et"], meId, false), /You do not own this file/);
  qp.deleteFiles(["q2.3et"], adminId, true);
  assert.ok(!existsSync(path.join(QUIZZES, "dir1", "q2.3et")));
  assert.equal(qp.getExerciseOwner("q2.3et"), 0);
  assert.throws(() => qp.deleteFiles(["missing.3et"], adminId, true), /Cannot delete file 'missing\.3et'/);
});

test("chownFiles: destino no facilitador → error", () => {
  const qp = qpFor("dir1");
  assert.throws(() => qp.chownFiles(["q1renamed.3et"], studentId), /The new owner is not a facilitator/);
});

test("chownFiles asigna el owner correctamente", () => {
  const qp = qpFor("dir1");
  qp.chownFiles(["q1renamed.3et"], meId);
  assert.equal(qp.getExerciseOwner("q1renamed.3et"), meId);
  qp.chownFiles(["q1renamed.3et"], adminId);
  assert.equal(qp.getExerciseOwner("q1renamed.3et"), adminId);
  const other = mkUser("fm_teacher2", 1, 0);
  qp.chownFiles(["q1renamed.3et"], other.id ?? 0);
  assert.equal(qp.getExerciseOwner("q1renamed.3et"), other.id);
});

test("updateClassesForDir: inserta nuevas, elimina viejas (0 = todos)", () => {
  assert.deepEqual(qpmod.getClassesForDir("dir1"), [0, 3]);
  qpmod.updateClassesForDir("dir1", [0, 3], [3, 7]);
  assert.deepEqual(qpmod.getClassesForDir("dir1"), [3, 7]);
  qpmod.updateClassesForDir("dir1", [3, 7], []);
  assert.deepEqual(qpmod.getClassesForDir("dir1"), []);
  qpmod.updateClassesForDir("dir1", [], [0, 3]);
  assert.deepEqual(qpmod.getClassesForDir("dir1"), [0, 3]);
});

test("fixExerciseowner: añade los .3et sin registro y borra los huérfanos", () => {
  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('dir1/orphan.3et', 0)").run();
  const { added, deleted } = qpmod.fixExerciseowner();
  assert.ok(added.includes("top.3et"), "top.3et sin registro debe añadirse");
  assert.ok(!added.includes("dir1/q1renamed.3et"));
  assert.ok(deleted.includes("dir1/orphan.3et"));
  const s1 = db
    .prepare("SELECT ownerid FROM bol_exerciseowner WHERE pathname = 'dir1/sub/s1.3et'")
    .get() as { ownerid: number } | undefined;
  assert.ok(s1, "s1 debe tener registro");
  const orphan = db
    .prepare("SELECT COUNT(*) AS n FROM bol_exerciseowner WHERE pathname = 'dir1/orphan.3et'")
    .get() as { n: number };
  assert.equal(orphan.n, 0);
});

test("insertFiles (copy): copia y asigna el owner al copiador", () => {
  const qp = qpFor("dir1");
  const src = qpmod.createQuizPath(false);
  src.init("", true, false, []);
  writeQuiz("copy_me.3et", "copy me");
  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('copy_me.3et', ?)").run(studentId);
  qpmod.insertFiles(qp, src, ["copy_me.3et"], "copy", meId, false);
  assert.ok(existsSync(path.join(QUIZZES, "dir1", "copy_me.3et")));
  assert.ok(existsSync(path.join(QUIZZES, "copy_me.3et")));
  assert.equal(qp.getExerciseOwner("copy_me.3et"), meId);
  assert.equal(src.getExerciseOwner("copy_me.3et"), studentId);
});

test("insertFiles (move): mueve y conserva el owner; destino existente → error", () => {
  const qp = qpFor("dir1");
  const src = qpmod.createQuizPath(false);
  src.init("", true, false, []);
  writeQuiz("move_me.3et", "move me");
  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('move_me.3et', ?)").run(studentId);
  qpmod.insertFiles(qp, src, ["move_me.3et"], "move", adminId, true);
  assert.ok(existsSync(path.join(QUIZZES, "dir1", "move_me.3et")));
  assert.ok(!existsSync(path.join(QUIZZES, "move_me.3et")));
  assert.equal(qp.getExerciseOwner("move_me.3et"), studentId);
  assert.equal(src.getExerciseOwner("move_me.3et"), 0);

  assert.throws(
    () => qpmod.insertFiles(qp, src, ["copy_me.3et"], "copy", meId, true),
    /Destination file 'copy_me\.3et' already exists/,
  );
});

test("insertPassages: copia selectedPaths del origen a los marcados", () => {
  const srcXml = readQuiz("dir1/sub/s1.3et");
  writeQuiz("dir1/pass_dst1.3et", srcXml);
  writeQuiz("dir1/pass_dst2.3et", srcXml);
  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('dir1/pass_dst1.3et', ?)").run(meId);
  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('dir1/pass_dst2.3et', ?)").run(meId);

  qpmod.insertPassages("dir1", ["pass_dst1.3et", "pass_dst2.3et"], "dir1/sub/s1.3et", meId);

  const srcSel = tq.decodeQuiz("dir1/sub/s1.3et").selectedPaths;
  assert.deepEqual(tq.decodeQuiz("dir1/pass_dst1.3et").selectedPaths, srcSel);
  assert.deepEqual(tq.decodeQuiz("dir1/pass_dst2.3et").selectedPaths, srcSel);
});

test("insertPassages: BD distinta u otro owner → error sin modificar", () => {
  const before = tq.decodeQuiz("dir1/pass_dst1.3et").selectedPaths;

  writeQuiz("dir1/otherdb.3et", readQuiz("dir1/pass_dst1.3et").replace("<database>ETCBC4</database>", "<database>nestle1904</database>"));
  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('dir1/otherdb.3et', ?)").run(meId);
  assert.throws(
    () => qpmod.insertPassages("dir1", ["otherdb.3et"], "dir1/sub/s1.3et", meId),
    /does not use the database 'ETCBC4'/,
  );

  db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('dir1/notmine.3et', ?)").run(studentId);
  writeQuiz("dir1/notmine.3et", readQuiz("dir1/pass_dst1.3et"));
  assert.throws(
    () => qpmod.insertPassages("dir1", ["notmine.3et"], "dir1/sub/s1.3et", meId),
    /You do not own all of the selected files/,
  );

  assert.deepEqual(tq.decodeQuiz("dir1/pass_dst1.3et").selectedPaths, before);
  assert.throws(
    () => qpmod.insertPassages("dir1", ["pass_dst1.3et"], "dir1/missing.3et", meId),
    /Cannot open file/,
  );
});
