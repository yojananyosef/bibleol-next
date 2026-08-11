import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import type { EndQuizPayload } from "../../src/lib/services/statistics.ts";
import { SECS_PER_DAY } from "../../src/lib/statistics/period.ts";

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-report-"));
process.env.BIBLEOL_DATA_DIR = TMP;

// Reportes de Mod_statistics/Mod_grades: allTemplates, allQuizzes,
// allReqFeatures, get_score_by_date_user_templ, get_features_by_date_user_templ,
// get_quizzes_duration, purge y helpers de Mod_grades.

const QUIZCODE = `<?xml version="1.0"?>
<questiontemplate version="3">
  <quizfeatures version="3">
    <show>visual</show>
    <request>gn</request>
    <request>sp</request>
  </quizfeatures>
</questiontemplate>`;

let db: Database.Database;
let stats: typeof import("../../src/lib/services/statistics.ts");
let studentId: number;
let teacherId: number;
let classId: number;
let templ1: number;
let templ2: number;
let quiz1: number;

before(async () => {
  const { getAppDb } = await import("../../src/lib/db/sqlite.ts");
  stats = await import("../../src/lib/services/statistics.ts");
  db = getAppDb();

  studentId = db
    .prepare("INSERT INTO bol_user (first_name, last_name, username, password, isadmin, preflang) VALUES ('S','T','repstudent','x',0,'en')")
    .run().lastInsertRowid as number;
  teacherId = db
    .prepare("INSERT INTO bol_user (first_name, last_name, username, password, isadmin, preflang) VALUES ('T','E','repteacher','x',0,'en')")
    .run().lastInsertRowid as number;

  classId = db
    .prepare("INSERT INTO bol_class (classname, password, ownerid, priority) VALUES ('Report Class','', ?, 0)")
    .run(teacherId).lastInsertRowid as number;
  db.prepare("INSERT INTO bol_userclass (userid, classid) VALUES (?, ?)").run(studentId, classId);
  const dirId = db
    .prepare("INSERT INTO bol_exercisedir (pathname) VALUES ('ETCBC4/demo')")
    .run().lastInsertRowid as number;
  db.prepare("INSERT INTO bol_classexercise (classid, pathid) VALUES (?, ?)").run(classId, dirId);

  templ1 = stats.newQuizTemplate(studentId, "ETCBC4/demo/report1.3et", QUIZCODE, "ETCBC4", "ETCBC4", "word");
  templ2 = stats.newQuizTemplate(studentId, "ETCBC4/demo/report2.3et", QUIZCODE, "ETCBC4", "ETCBC4", "word");

  const start = Math.floor(Date.now() / 1000);
  quiz1 = stats.startQuiz(studentId, templ1, ["Genesis 1:1"]);
  // Simulamos que el quiz empezó hace 3 días a las 10:00 UTC
  db.prepare("UPDATE bol_sta_quiz SET start = ? WHERE id = ?").run(start - 3 * SECS_PER_DAY, quiz1);
  const payload1: EndQuizPayload = {
    quizid: quiz1,
    grading: true,
    question_count: 1,
    questions: [
      {
        text: "Which gender?",
        location: "Genesis 1:1",
        start_time: 0,
        end_time: 120,
        show_feat: { names: ["visual"], values: ["word"] },
        req_feat: {
          names: ["gn", "sp"],
          correct_answer: ["m", "subs"],
          users_answer: ["m", "prps"],
          users_answer_was_correct: [true, false],
        },
      },
    ],
  };
  stats.endQuiz(studentId, payload1);

  const quiz2 = stats.startQuiz(studentId, templ2, ["Genesis 1:2"]);
  db.prepare("UPDATE bol_sta_quiz SET start = ? WHERE id = ?").run(start - 2 * SECS_PER_DAY, quiz2);
  stats.endQuiz(studentId, {
    quizid: quiz2,
    grading: false,
    question_count: 1,
    questions: [
      {
        text: "Which number?",
        location: "Genesis 1:2",
        start_time: 0,
        end_time: 60,
        show_feat: { names: ["visual"], values: ["word"] },
        req_feat: {
          names: ["gn", "sp"],
          correct_answer: ["f", "subs"],
          users_answer: ["f", "subs"],
          users_answer_was_correct: [true, true],
        },
      },
    ],
  });

  // Examen con resultado para get_score_by_user_active_exam
  const examId = db
    .prepare(`INSERT INTO bol_exam (exam_name, ownerid, examcode, examcodehash) VALUES ('Rep Exam', ?, '<exam><examname>Rep Exam</examname><teacher_id>${teacherId}</teacher_id><description>d</description><exercise><exercisename>ETCBC4/demo/report1.3et</exercisename><numq>2</numq><weight>2</weight></exercise></exam>', 'h')`)
    .run(teacherId).lastInsertRowid as number;
  const activeId = db
    .prepare("INSERT INTO bol_exam_active (class_id, exam_id, exam_name, exam_start_time, exam_end_time, instance_name) VALUES (?, ?, 'Rep Exam', 0, ?, 'I')")
    .run(classId, examId, Math.floor(Date.now() / 1000) + SECS_PER_DAY).lastInsertRowid as number;
  db.prepare("INSERT INTO bol_exam_results (userid, activeexamid, quizid, quiztemplid) VALUES (?, ?, ?, ?)")
    .run(studentId, activeId, quiz1, templ1);
});

after(() => {
  db.close();
});

test("allTemplates: plantillas con quizzes terminados", () => {
  const templates = stats.allTemplates(studentId);
  assert.equal(templates.length, 2);
  assert.deepEqual(
    templates.map((t) => t.pathname),
    ["ETCBC4/demo/report1.3et", "ETCBC4/demo/report2.3et"],
  );
});

test("allQuizzes: resumen por quiz", () => {
  const quizzes = stats.allQuizzes(templ1);
  assert.equal(quizzes.length, 1);
  assert.equal(quizzes[0].correct, 1);
  assert.equal(quizzes[0].wrong, 1);
  assert.equal(quizzes[0].duration, 120);
  assert.match(quizzes[0].time, /^\d{4}-\d{2}-\d{2} /);
});

test("allReqFeatures: errores por feature", () => {
  const errors = stats.allReqFeatures(templ1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, "sp");
  assert.equal(errors[0].value, "subs"); // value = respuesta correcta
  assert.equal(errors[0].cnt, 1);
});

test("getScoreByDateUserTempl: rendimiento diario", () => {
  const start = Math.floor(Date.now() / 1000) - 4 * SECS_PER_DAY;
  const end = Math.floor(Date.now() / 1000);
  const scores = stats.getScoreByDateUserTempl(studentId, [templ1, templ2], start, end, true);
  assert.equal(scores.length, 2);
  // Día de quiz1: 50% correcto; día de quiz2: 100%
  assert.deepEqual(
    scores.map((s) => Math.round(s.score)).sort((a, b) => a - b),
    [50, 100],
  );
  const s1 = scores.find((s) => Math.round(s.score) === 50);
  assert.ok(s1);
  // featpermin = 60 * cnt / duration
  assert.equal(s1.featpermin, (60 * 2) / 120);
});

test("getScoreByDateUserTempl: nongraded excluye/puede incluir según flag", () => {
  const start = Math.floor(Date.now() / 1000) - 4 * SECS_PER_DAY;
  const end = Math.floor(Date.now() / 1000);
  const without = stats.getScoreByDateUserTempl(studentId, [templ1, templ2], start, end, false);
  const withNongraded = stats.getScoreByDateUserTempl(studentId, [templ1, templ2], start, end, true);
  // quiz2 no está calificado (grading=0) → solo sale con nongraded
  assert.equal(without.length, 1);
  assert.equal(withNongraded.length, 2);
});

test("getFeaturesByDateUserTempl: % por feature", () => {
  const start = Math.floor(Date.now() / 1000) - 4 * SECS_PER_DAY;
  const end = Math.floor(Date.now() / 1000);
  const feats = stats.getFeaturesByDateUserTempl(studentId, [templ1], start, end, true);
  assert.equal(feats.get("gn"), 100);
  assert.equal(feats.get("sp"), 0);
});

test("getQuizzesDuration: duraciones en el rango", () => {
  const start = Math.floor(Date.now() / 1000) - 4 * SECS_PER_DAY;
  const end = Math.floor(Date.now() / 1000);
  const rows = stats.getQuizzesDuration([templ1, templ2], start, end);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.duration).sort((a, b) => a - b),
    [60, 120],
  );
});

test("getTemplidsForPathnameAndUser / getUsersAndTempl", () => {
  const ids = stats.getTemplidsForPathnameAndUser("ETCBC4/demo/report1", studentId);
  assert.ok(ids.includes(templ1));
  const users = stats.getUsersAndTempl("ETCBC4/demo/report1", classId);
  assert.deepEqual([...users.keys()], [studentId]);
  assert.deepEqual(users.get(studentId), [templ1]);
});

test("getPathnamesForClass: paths relativos", () => {
  const paths = stats.getPathnamesForClass(classId, [studentId]);
  assert.deepEqual(paths, ["ETCBC4/demo/report1", "ETCBC4/demo/report2"]);
});

test("getScoreByUserTempl: intentos con perc sobre tot_questions", () => {
  const start = Math.floor(Date.now() / 1000) - 4 * SECS_PER_DAY;
  const end = Math.floor(Date.now() / 1000);
  const attempts = stats.getScoreByUserTempl(studentId, [templ1], start, end, false);
  assert.equal(attempts.length, 1);
  // tot_questions = question_count * n_features_request = 1 * 2 = 2
  assert.equal(attempts[0].cnt, 2);
  assert.equal(attempts[0].perc, 50);
});

test("getScoreByUserActiveExam: pesos del examcode", () => {
  const attempts = stats.getScoreByUserActiveExam(studentId, [1], false);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].weight, 2);
  assert.equal(attempts[0].exerciseName, "ETCBC4/demo/report1.3et");
  assert.equal(attempts[0].perc, 50);
});

test("getFeaturesByDateExamResult", () => {
  const feats = stats.getFeaturesByDateExamResult(studentId, [1], false);
  assert.equal(feats.get("gn"), 100);
});

test("getExamsForClass / checkIfEnrolled / getUsersAndExamResults", () => {
  const exams = stats.getExamsForClass(classId);
  assert.equal(exams.length, 1);
  assert.equal(exams[0].name, "Rep Exam");
  const enrolled = stats.checkIfEnrolled(classId, studentId);
  assert.equal(enrolled?.classname, "Report Class");
  assert.equal(stats.checkIfEnrolled(classId, teacherId), undefined);
  assert.deepEqual(stats.getUsersAndExamResults(exams[0].id), [studentId]);
});

test("getQuizDetail: detalle por pregunta", () => {
  const rows = stats.getQuizDetail(studentId, quiz1);
  assert.equal(rows.length, 2); // gn + sp
  assert.equal(rows[0].correct, 1);
  assert.equal(rows[1].correct, 0);
  assert.equal(rows[0].location, "Genesis 1:1");
});

test("purge: invalida los quizzes", () => {
  stats.purge(studentId);
  assert.equal(stats.allTemplates(studentId).length, 0);
  assert.equal(stats.allQuizzes(templ1).length, 0);
});
