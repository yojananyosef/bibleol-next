import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import type { EndQuizQuestion } from "../../src/lib/services/statistics.ts";

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-stats-"));
process.env.BIBLEOL_DATA_DIR = TMP;

// endQuiz (Mod_statistics::endQuiz): persistencia de las estadísticas del quiz
// en bol_sta_question/displayfeature/requestfeature + cierre del quiz.

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
let quizid: number;
let userid: number;

before(async () => {
  const { getAppDb } = await import("../../src/lib/db/sqlite.ts");
  stats = await import("../../src/lib/services/statistics.ts");
  db = getAppDb();

  // bol_sta_quiztemplate.userid → bol_user.id (FK)
  userid = db
    .prepare(
      "INSERT INTO bol_user (first_name, last_name, username, password, isadmin, preflang) VALUES ('Stats','Test','statsuser','x',0,'en')",
    )
    .run().lastInsertRowid as number;

  const templid = stats.newQuizTemplate(userid, "ETCBC4/demo/stats.3et", QUIZCODE, "ETCBC4", "ETCBC4", "word");
  quizid = stats.startQuiz(userid, templid, ["Genesis 1:1", "Genesis 1:2"]);
});

after(() => {
  db.close();
});

/** Payload mínimo de una pregunta (formato de la serie del cliente legacy). */
function question(over: Partial<EndQuizQuestion> = {}): EndQuizQuestion {
  return {
    text: "Which gender?",
    location: "Genesis 1:1",
    start_time: 10,
    end_time: 25, // 15s invertidos
    show_feat: { names: ["visual"], values: ["wayyiqtol"] },
    req_feat: {
      names: ["gn", "sp"],
      correct_answer: ["m", "subs"],
      users_answer: ["m", "prps"],
      users_answer_was_correct: [true, false],
    },
    ...over,
  };
}

test("endQuiz: guarda preguntas, features y cierra el quiz con grading", () => {
  stats.endQuiz(userid, {
    quizid,
    grading: true,
    question_count: 2,
    questions: [question(), question({ text: "Which gender? (2)", location: "Genesis 1:2", end_time: 45 })],
  });

  // Tiempos: base start (a partir de startQuiz) + 15s (1ª) + 35s (2ª: end 45 - start 10)
  const quiz = db.prepare("SELECT * FROM bol_sta_quiz WHERE id = ?").get(quizid) as Record<string, unknown>;
  assert.equal(quiz.grading, 1, "grading debe quedar marcado");
  assert.equal(quiz.tot_questions, 4, "question_count * <request> del template");
  const start = quiz.start as number;
  assert.equal(quiz.end, start + 15 + 35, "end = start + tiempo acumulado");

  const questions = db.prepare("SELECT * FROM bol_sta_question WHERE quizid = ? ORDER BY time").all(quizid) as Array<Record<string, unknown>>;
  assert.equal(questions.length, 2);
  assert.equal(questions[0].txt, "Which gender?");
  assert.equal(questions[0].location, "Genesis 1:1");
  assert.equal(questions[0].time, start + 15);
  assert.equal(questions[1].time, start + 50);

  // show features: un valor por feature (qono 1)
  const displays = db.prepare("SELECT * FROM bol_sta_displayfeature WHERE questid = ?").all(questions[0].id) as Array<Record<string, unknown>>;
  assert.equal(displays.length, 1);
  assert.equal(displays[0].qono, 1);
  assert.equal(displays[0].name, "visual");
  assert.equal(displays[0].value, "wayyiqtol");

  // request features: acierto y fallo (correct 1/0)
  const requests = db.prepare("SELECT * FROM bol_sta_requestfeature WHERE questid = ? ORDER BY qono, name").all(questions[0].id) as Array<Record<string, unknown>>;
  assert.equal(requests.length, 2);
  assert.equal(requests[0].name, "gn");
  assert.equal(requests[0].answer, "m");
  assert.equal(requests[0].correct, 1);
  assert.equal(requests[1].name, "sp");
  assert.equal(requests[1].answer, "prps");
  assert.equal(requests[1].correct, 0);
});

test("endQuiz: grading=false y tiempos correctos con dos features", () => {
  const templid = stats.newQuizTemplate(userid, "ETCBC4/demo/stats-no-grading.3et", QUIZCODE, "ETCBC4", "ETCBC4", "word");
  const qid = stats.startQuiz(userid, templid, ["Genesis 1:3"]);

  stats.endQuiz(userid, {
    quizid: qid,
    grading: false,
    question_count: 1,
    questions: [question()],
  });

  const quiz = db.prepare("SELECT grading FROM bol_sta_quiz WHERE id = ?").get(qid) as { grading: number };
  assert.equal(quiz.grading, 0);
});

test("hashCode: sign-extend Java-style (32 bits con signo)", async () => {
  const { hashCode } = await import("../../src/lib/services/statistics.ts");
  assert.equal(hashCode(""), 0);
  // h*31 mod 2^32 con signo: casos largos no deben desbordar por encima de 2^31
  const h = hashCode("a".repeat(100));
  assert.ok(h >= -2147483648 && h <= 2147483647, `hashCode fuera de rango: ${h}`);
  assert.equal(hashCode("abc"), hashCode("abc"));
  assert.notEqual(hashCode("abc"), hashCode("abd"));
});

test("endQuiz: usuario ilegal y quiz inexistente se ignoran", () => {
  const before1 = (db.prepare("SELECT COUNT(*) n FROM bol_sta_question").get() as { n: number }).n;

  // userid distinto al dueño del quiz
  stats.endQuiz(43, { quizid, grading: true, question_count: 1, questions: [question()] });
  // quizid inexistente
  stats.endQuiz(userid, { quizid: 999999, grading: true, question_count: 1, questions: [question()] });

  const after1 = (db.prepare("SELECT COUNT(*) n FROM bol_sta_question").get() as { n: number }).n;
  assert.equal(before1, after1);
});