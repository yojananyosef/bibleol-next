import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import type { UserRow } from "../src/lib/services/users.ts";
import type { ExamCode } from "../src/lib/exams/exam-xml.ts";
import type { ActiveExamRow } from "../src/lib/exams/instance.ts";

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-exams-"));
process.env.BIBLEOL_DATA_DIR = TMP;

// FASE 7 — exámenes: examcode XML (build/parse/hash), instancias
// (bol_exam_active), deadline (bol_exam_status) y flujo take_exam.

let db: Database.Database;
let xml: typeof import("../src/lib/exams/exam-xml.ts");
let inst: typeof import("../src/lib/exams/instance.ts");
let ex: typeof import("../src/lib/services/exams.ts");

let me: UserRow; // profesor
let student: UserRow;

before(async () => {
  const { getAppDb } = await import("../src/lib/db/sqlite.ts");
  xml = await import("../src/lib/exams/exam-xml.ts");
  inst = await import("../src/lib/exams/instance.ts");
  ex = await import("../src/lib/services/exams.ts");
  db = getAppDb();

  const mk = (username: string, isteacher: number): UserRow => {
    const id = db
      .prepare(
        "INSERT INTO bol_user (first_name, last_name, username, password, isadmin, isteacher, preflang, accept_policy) VALUES (?, ?, ?, 'x', 0, ?, 'en', 9999999999)",
      )
      .run("Test", username, username, isteacher).lastInsertRowid as number;
    return db.prepare("SELECT * FROM bol_user WHERE id = ?").get(id) as UserRow;
  };
  me = mk("exam_teacher", 1);
  student = mk("exam_student", 0);
});

after(() => {
  db.close();
});

test("exam-xml: round-trip build→parse con parámetros extra y name+", () => {
  const code: ExamCode = {
    examname: "Examen + 1",
    teacher_id: me.id ?? 0,
    description: "Descripción de prueba <x>",
    exercises: [
      { exercisename: "ETCBC4/demo/demo1.3et", numq: 5, weight: 1, params: {} },
      { exercisename: "ETCBC4/demo/demo2.3et", numq: 0, weight: 2, params: { universe: "OT" } },
    ],
  };
  const out = xml.buildExamCode(code);
  assert.match(out, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(out, /<examname>Examen %2B 1<\/examname>/, "espacios '+' se convierten a %2B");

  const back = xml.parseExamCode(out);
  assert.equal(back.examname, "Examen %2B 1", "el parse devuelve %2B crudo");
  assert.equal(xml.displayExamName(back.examname), "Examen + 1", "la UI deshace %2B");
  assert.equal(back.teacher_id, me.id ?? 0);
  assert.equal(back.description, "Descripción de prueba <x>");
  assert.equal(back.exercises.length, 2);
  assert.deepEqual(
    back.exercises.map((e) => [e.exercisename, e.numq, e.weight]),
    [
      ["ETCBC4/demo/demo1.3et", 5, 1],
      ["ETCBC4/demo/demo2.3et", 10, 2],
    ],
    "numq 0 → default 10",
  );
  assert.deepEqual(back.exercises[1].params, { universe: "OT" });
  assert.equal(xml.exerciseNumq(back.exercises[1]), 10);
});

test("exam-xml: hash md5 del texto (estable)", () => {
  const out = xml.buildExamCode({ examname: "H", teacher_id: 1, description: "d", exercises: [] });
  assert.equal(xml.examCodeHash(out), xml.examCodeHash(out));
  assert.match(xml.examCodeHash(out), /^[0-9a-f]{32}$/);
});

test("exam-xml: parse ignora malformados (sin exercisename no entra)", () => {
  const back = xml.parseExamCode(
    "<exam><examname>X</examname><exercise><numq>3</numq></exercise><exercise><exercisename>a.3et</exercisename></exercise></exam>",
  );
  assert.equal(back.exercises.length, 1);
  assert.equal(back.exercises[0].exercisename, "a.3et");
});

test("instance: deadline — min(end, now+duration) y teacher→end", () => {
  const active: ActiveExamRow = {
    id: 1,
    exam_name: "E",
    class_id: 1,
    exam_start_time: 1000,
    exam_end_time: 10_000,
    exam_length: 90,
    exam_id: 1,
    instance_name: "I",
  };
  assert.equal(inst.examDeadline(0, active, false), Math.min(10_000, 0 + 90 * 60));
  assert.equal(inst.examDeadline(50_000, active, false), 10_000, "capado por end_time");
  assert.equal(inst.examDeadline(50_000, active, true), 10_000, "profesor → end_time");
  assert.equal(inst.examStage(500, active), "future");
  assert.equal(inst.examStage(5_000, active), "active");
  assert.equal(inst.examStage(11_000, active), "past");
});

test("exams: createExam valida nombre ilegal y guarda hash", () => {
  assert.throws(() => ex.createExam(me.id ?? 0, "bad/name", []), /illegal_char_folder_name/);
  const e = ex.createExam(me.id ?? 0, "Examen demo", ["ETCBC4/demo/demo1.3et"]);
  const row = db.prepare("SELECT * FROM bol_exam WHERE id = ?").get(e.id) as { examcode: string; examcodehash: string };
  assert.equal(row.examcodehash, xml.examCodeHash(row.examcode));
  assert.match(row.examcode, /<exercisename>ETCBC4\/demo\/demo1\.3et<\/exercisename>/);
});

test("exams: saveExam sobrescribe y deleteExam es soft", () => {
  const e = ex.createExam(me.id ?? 0, "E2", []);
  ex.saveExam(e.id, { examname: "E2 v2", teacher_id: me.id ?? 0, description: "d2", exercises: [{ exercisename: "a.3et", numq: 3, weight: 1, params: {} }] });
  assert.equal(ex.getExamById(e.id)?.exam_name, "E2 v2");
  assert.equal(xml.parseExamCode(ex.getExamById(e.id)!.examcode).exercises[0].numq, 3);

  ex.deleteExam(e.id);
  assert.equal(ex.getExamById(e.id)?.archived, 1);
  assert.ok(!ex.getExams().some((x) => x.id === e.id), "getExams filtra archivados");
});

test("exams: instancia — create/delete y ventana", () => {
  const e = ex.createExam(me.id ?? 0, "E3", ["b.3et"]);
  ex.createExamInstance("E3", 1, 1000, 20_000, 90, e.id, "Inst 1");
  const row = db.prepare("SELECT * FROM bol_exam_active").get() as ActiveExamRow;
  assert.equal(row.exam_id, e.id);
  assert.equal(row.exam_length, 90);
  assert.equal(inst.examStage(Math.floor(Date.now() / 1000), row), "past");
  ex.deleteExamInstance(row.id);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_exam_active").get() as { n: number }).n, 0);
});

test("exams: takeExamData — deadline persistido y ejercicios pendientes", async () => {
  const e = ex.createExam(me.id ?? 0, "E4", ["c.3et", "d.3et"]);
  ex.createExamInstance("E4", 1, 0, Math.floor(Date.now() / 1000) + 86_400, 90, e.id, "Inst");
  const row = db.prepare("SELECT * FROM bol_exam_active").get() as ActiveExamRow;

  const t1 = ex.takeExamData(student, row.id);
  assert.deepEqual(t1.exercises.map((x) => x.name), ["c.3et", "d.3et"]);
  assert.equal(t1.status.deadline, Math.min(row.exam_end_time, Math.floor(Date.now() / 1000) + 90 * 60));

  const t2 = ex.takeExamData(student, row.id);
  assert.equal(t2.status.id, t1.status.id, "el status se reutiliza (deadline persistido)");
  assert.equal(t2.status.deadline, t1.status.deadline);

  // Completar el primer ejercicio → queda solo el segundo.
  const templid = db
    .prepare("INSERT INTO bol_sta_quiztemplate (userid, pathname, dbname, dbpropname, qoname, quizcode, quizcodehash) VALUES (?, 'c.3et', 'x', 'x', 'x', '<x/>', 'h')")
    .run(student.id ?? 0).lastInsertRowid as number;
  db.prepare("INSERT INTO bol_exam_results (userid, activeexamid, quizid, quiztemplid) VALUES (?, ?, 1, ?)").run(student.id ?? 0, row.id, templid);
  assert.deepEqual(ex.getCompletedExamExercises(student.id ?? 0, row.id), ["c.3et"]);

  const t3 = ex.takeExamData(student, row.id);
  assert.deepEqual(t3.exercises.map((x) => x.name), ["d.3et"]);

  // El alumno que terminó no puede retomar.
  db.prepare("INSERT INTO bol_exam_finished (userid, activeexamid) VALUES (?, ?)").run(student.id ?? 0, row.id);
  assert.throws(() => ex.takeExamData(student, row.id), /no_active_exam/);

  // El profesor puede retomarlo sin límite de duración (deadline = end_time).
  const t4 = ex.takeExamData(me, row.id);
  assert.equal(t4.status.deadline, row.exam_end_time);
  assert.equal(t4.exercises.length, 2, "el profesor ve todos los ejercicios");
});