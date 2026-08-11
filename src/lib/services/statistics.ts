/**
 * services/statistics.ts — Réplica 1:1 de `models/Mod_statistics.php`
 * (parte quiz: hashCode, newQuizTemplate, startQuiz) sobre la BD de
 * aplicación (tablas bol_sta_quiztemplate, bol_sta_quiz, bol_sta_universe).
 */

import { getAppDb } from "../db/sqlite.ts";
import { StatisticsPeriod } from "../statistics/period.ts";
import { parseExamCode } from "../exams/exam-xml.ts";
import { gaveAccess } from "./userclass.ts";

/** hashCode() Java-style de Mod_statistics (sign-extend a 32 bits). */
export function hashCode(s: string): number {
  const len = s.length;
  let h = 0;
  for (let i = 0; i < len; ++i) {
    // PHP: ($h*31 + ord($s[$i])) & 0xffffffff, con signo de 32 bits
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
    // Aplica el signo de 32 bits (PHP int 64 en este rango es como 32-bit signed)
  }
  return h | 0;
}

interface QuizTemplateRow {
  id: number;
  quizcode: string;
}

/**
 * Insert a quiz template into the database unless it is already there.
 * @returns The ID of the quiz template in the database.
 */
export function newQuizTemplate(
  userid: number,
  quizFile: string,
  fileContent: string,
  dbName: string,
  dbProp: string,
  qoName: string,
): number {
  const db = getAppDb();
  const hash = hashCode(fileContent);

  const existing = db
    .prepare(
      "SELECT id, quizcode FROM bol_sta_quiztemplate WHERE pathname = ? AND quizcodehash = ? AND userid = ?",
    )
    .all(quizFile, hash, userid) as QuizTemplateRow[];
  for (const row of existing) {
    if (row.quizcode === fileContent) return row.id; // Already in database
  }

  const info = db
    .prepare(
      "INSERT INTO bol_sta_quiztemplate (userid, pathname, dbname, dbpropname, qoname, quizcode, quizcodehash) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(userid, quizFile, dbName, dbProp, qoName, fileContent, hash);

  return Number(info.lastInsertRowid);
}

/**
 * Stores information about the start of a quiz.
 * @param templid The ID of the quiz template (newQuizTemplate).
 * @param universeStrings The universe used for this quiz.
 * @returns The ID of the quiz in the database.
 */
export function startQuiz(userid: number, templid: number, universeStrings: string[]): number {
  const db = getAppDb();
  const start = Math.floor(Date.now() / 1000); // UNIX time

  const quizInfo = db
    .prepare("INSERT INTO bol_sta_quiz (templid, userid, start, valid) VALUES (?, ?, ?, 1)")
    .run(templid, userid, start);
  const quizid = Number(quizInfo.lastInsertRowid);

  const insertComponent = db.prepare(
    "INSERT INTO bol_sta_universe (quizid, userid, component) VALUES (?, ?, ?)",
  );
  for (const uniItem of universeStrings) insertComponent.run(quizid, userid, uniItem);

  return quizid;
}

// ---------------------------------------------------------------------------
// endQuiz (Mod_statistics::endQuiz)
// ---------------------------------------------------------------------------

/** Payload de statistics/update_stat (serie del cliente legacy 1:1). */
export interface EndQuizQuestion {
  text: string;
  location: string;
  start_time: number;
  end_time: number;
  show_feat: { names: string[]; values: string[] };
  req_feat: {
    names: string[];
    correct_answer: string[];
    users_answer: string[];
    users_answer_was_correct: boolean[];
  };
}

export interface EndQuizPayload {
  quizid: number;
  grading: boolean;
  question_count: number;
  questions: EndQuizQuestion[];
}

function isTrue(v: boolean | string | undefined): boolean {
  // El legacy (PHP) compara con =='true' porque jQuery serializa booleanos
  // como "true"/"false"; por JSON llegan booleanos reales.
  return v === true || v === "true";
}

/**
 * endQuiz(): procesa las estadísticas enviadas al final de un quiz.
 * Port 1:1 de Mod_statistics::endQuiz (mismo ajuste de tiempos, misma
 * estructura de bol_sta_question/displayfeature/requestfeature).
 */
export function endQuiz(userid: number, payload: EndQuizPayload): void {
  const db = getAppDb();
  const quizid = payload.quizid;

  const row = db.prepare("SELECT userid, start FROM bol_sta_quiz WHERE id = ?").get(quizid) as
    | { userid: number; start: number }
    | undefined;
  if (!row) return; // Problemas con la BD (el legacy registra el error y sale)
  if (row.userid !== userid) return; // Illegal user id

  // Ajustamos los tiempos de cada pregunta: solo usamos el tiempo invertido en
  // cada pregunta según el cliente y lo sumamos a la hora de inicio del servidor.
  let time = row.start;

  const insertQuestion = db.prepare(
    "INSERT INTO bol_sta_question (quizid, txt, location, time, userid) VALUES (?, ?, ?, ?, ?)",
  );
  const insertDisplay = db.prepare(
    "INSERT INTO bol_sta_displayfeature (questid, qono, name, value, userid) VALUES (?, ?, ?, ?, ?)",
  );
  const insertRequest = db.prepare(
    "INSERT INTO bol_sta_requestfeature (questid, qono, name, value, answer, correct, userid) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  const doTransaction = db.transaction(() => {
    for (const question of payload.questions) {
      time += question.end_time - question.start_time;
      const info = insertQuestion.run(quizid, question.text, question.location, time, userid);
      const questid = Number(info.lastInsertRowid);

      // Update show feature information
      const showFeat = question.show_feat;
      const maxFeatno = showFeat.names.length; // The number of features is the number of names
      let qono = 0; // Quiz object number
      let featno = 0; // Feature number

      if (showFeat.values !== undefined) {
        // Check that the question was not empty
        for (const val of showFeat.values) {
          insertDisplay.run(questid, qono + 1, showFeat.names[featno] ?? "", val, userid);
          if (++featno === maxFeatno) {
            // Next question object
            ++qono;
            featno = 0;
          }
        }
      }

      // Update request feature information
      const reqFeat = question.req_feat;
      const maxFeatno2 = reqFeat.names.length;
      qono = 0;
      featno = 0;
      let ix = 0; // Index into 'correct_answer', 'users_answer', and 'users_answer_was_correct'

      if (reqFeat.correct_answer !== undefined) {
        // Check that the question was not empty
        for (const val of reqFeat.correct_answer) {
          insertRequest.run(
            questid,
            qono + 1,
            reqFeat.names[featno] ?? "",
            val,
            reqFeat.users_answer[ix] ?? "",
            isTrue(reqFeat.users_answer_was_correct[ix]) ? 1 : 0,
            userid,
          );
          ++ix;
          if (++featno === maxFeatno2) {
            // Next question object
            ++qono;
            featno = 0;
          }
        }
      }
    }
  });
  doTransaction();

  // Set end time and grading for quiz (MRCN: and the total number of questions)
  const totFeatures = quizRequestedFeatures(quizid);
  db.prepare("UPDATE bol_sta_quiz SET end = ?, grading = ?, tot_questions = ? WHERE id = ?").run(
    time,
    payload.grading === true ? 1 : 0,
    payload.question_count * totFeatures,
    quizid,
  );
}

/**
 * quizRequestedFeatures(): número de features solicitadas por un quiz
 * (cuenta las <request>…</request> del template).
 */
export function quizRequestedFeatures(quizid: number): number {
  const db = getAppDb();
  const row = db
    .prepare(
      "SELECT quizcode FROM bol_sta_quiz JOIN bol_sta_quiztemplate ON bol_sta_quiztemplate.id = bol_sta_quiz.templid WHERE bol_sta_quiz.id = ?",
    )
    .get(quizid) as { quizcode: string } | undefined;

  if (!row) return 1;

  const matches = row.quizcode.match(/<request.*>(.*)<\/request>/g);
  return matches === null ? 1 : matches.length;
}

// ---------------------------------------------------------------------------
// Reportes (Mod_statistics: show_stat / student_time / student_exercise)
// ---------------------------------------------------------------------------

export interface QuizTemplateSummary {
  qtid: number;
  pathname: string;
  dbname: string | null;
  dbpropname: string | null;
  qoname: string | null;
}

/** allTemplates(user_id) — plantillas con quizzes terminados. */
export function allTemplates(userId: number): QuizTemplateSummary[] {
  const db = getAppDb();
  return db
    .prepare(
      "SELECT bol_sta_quiztemplate.id AS qtid, pathname, dbname, dbpropname, qoname " +
        "FROM bol_sta_quiz JOIN bol_sta_quiztemplate ON bol_sta_quiztemplate.id = bol_sta_quiz.templid " +
        "WHERE bol_sta_quiz.valid = 1 AND bol_sta_quiz.userid = ? AND bol_sta_quiz.end IS NOT NULL " +
        "GROUP BY bol_sta_quiztemplate.id ORDER BY pathname",
    )
    .all(userId) as QuizTemplateSummary[];
}

export interface QuizSummaryRow {
  id: number;
  time: string;
  duration: number;
  correct: number;
  wrong: number;
}

/** allQuizzes(qtid) — resumen por quiz de una plantilla. */
export function allQuizzes(qtid: number): QuizSummaryRow[] {
  const db = getAppDb();
  return db
    .prepare(
      "SELECT bol_sta_quiz.id, datetime(bol_sta_quiz.start, 'unixepoch') AS time, " +
        "bol_sta_quiz.end - bol_sta_quiz.start AS duration, " +
        "sum(bol_sta_requestfeature.correct) AS correct, " +
        "sum(1 - bol_sta_requestfeature.correct) AS wrong " +
        "FROM bol_sta_quiz JOIN bol_sta_question ON bol_sta_quiz.id = bol_sta_question.quizid " +
        "JOIN bol_sta_requestfeature ON bol_sta_question.id = bol_sta_requestfeature.questid " +
        "WHERE bol_sta_quiz.valid = 1 AND bol_sta_quiz.templid = ? AND bol_sta_quiz.end IS NOT NULL " +
        "GROUP BY bol_sta_quiz.id",
    )
    .all(qtid) as QuizSummaryRow[];
}

export interface FeatureErrorRow {
  id: number;
  name: string;
  value: string;
  cnt: number;
}

/** allReqFeatures(qtid) — errores por feature de una plantilla. */
export function allReqFeatures(qtid: number): FeatureErrorRow[] {
  const db = getAppDb();
  return db
    .prepare(
      "SELECT bol_sta_quiz.id, bol_sta_requestfeature.name, bol_sta_requestfeature.value, count(*) AS cnt " +
        "FROM bol_sta_quiz JOIN bol_sta_question ON bol_sta_quiz.id = bol_sta_question.quizid " +
        "JOIN bol_sta_requestfeature ON bol_sta_question.id = bol_sta_requestfeature.questid " +
        "WHERE bol_sta_quiz.valid = 1 AND bol_sta_quiz.templid = ? AND bol_sta_quiz.end IS NOT NULL " +
        "AND bol_sta_requestfeature.correct = 0 " +
        "GROUP BY bol_sta_quiz.id, bol_sta_requestfeature.name, bol_sta_requestfeature.value " +
        "ORDER BY bol_sta_quiz.id",
    )
    .all(qtid) as FeatureErrorRow[];
}

/** get_templ_db(templids) — config de BD del primer template (más reciente). */
export function getTemplDb(templids: number[]): { dbname: string | null; dbpropname: string | null; qoname: string | null } {
  if (templids.length === 0) return { dbname: null, dbpropname: null, qoname: null };
  const db = getAppDb();
  const ph = templids.map(() => "?").join(",");
  const row = db
    .prepare(`SELECT dbname, dbpropname, qoname FROM bol_sta_quiztemplate WHERE id IN (${ph}) ORDER BY id DESC LIMIT 1`)
    .get(...templids) as { dbname: string | null; dbpropname: string | null; qoname: string | null } | undefined;
  return row ?? { dbname: null, dbpropname: null, qoname: null };
}

/** get_templates_for_class_and_students(classid, userids) — templates de los ejercicios de la clase. */
export function getTemplatesForClassAndStudents(classid: number, userids: number[]): number[] {
  const db = getAppDb();
  const dirs = db
    .prepare(
      "SELECT ed.pathname FROM bol_classexercise JOIN bol_exercisedir ed ON bol_classexercise.pathid = ed.id WHERE bol_classexercise.classid = ?",
    )
    .all(classid) as { pathname: string }[];
  if (dirs.length === 0 || userids.length === 0) return [];
  const ph = userids.map(() => "?").join(",");
  const ids: number[] = [];
  for (const dir of dirs) {
    const rows = db
      .prepare(
        `SELECT id FROM bol_sta_quiztemplate WHERE pathname LIKE ? AND userid IN (${ph})`,
      )
      .all(`${dir.pathname}/%`, ...userids) as { id: number }[];
    for (const r of rows) if (!ids.includes(r.id)) ids.push(r.id);
  }
  return ids;
}
/** get_templates_for_students(userids) — todos los templates de esos alumnos. */
export function getTemplatesForStudents(userids: number[]): number[] {
  if (userids.length === 0) return [];
  const db = getAppDb();
  const ph = userids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id FROM bol_sta_quiztemplate WHERE userid IN (${ph})`).all(...userids) as { id: number }[];
  return rows.map((r) => r.id);
}

/** get_pathnames_for_class(classid, studentIds?) — paths de ejercicios con resultados en la clase. */
export function getPathnamesForClass(classid: number, studentIds?: number[]): string[] {
  const db = getAppDb();
  const dirs = db
    .prepare(
      "SELECT ed.pathname FROM bol_classexercise JOIN bol_exercisedir ed ON bol_classexercise.pathid = ed.id WHERE bol_classexercise.classid = ?",
    )
    .all(classid) as { pathname: string }[];
  if (dirs.length === 0) return [];
  if (studentIds !== undefined && studentIds.length === 0) return [];
  const paths: string[] = [];
  for (const dir of dirs) {
    const rows = db
      .prepare(
        `SELECT DISTINCT pathname FROM bol_sta_quiztemplate qt JOIN bol_userclass uc ON uc.userid = qt.userid WHERE qt.pathname LIKE ? AND uc.classid = ?`,
      )
      .all(`${dir.pathname}/%`, classid) as { pathname: string }[];
    for (const r of rows) {
      const rel = r.pathname.replace(/\.3et$/, "");
      if (!paths.includes(rel)) paths.push(rel);
    }
  }
  return paths.sort();
}

/** get_pathnames_for_templids(templids) — mapa id → path relativo (sin .3et). */
export function getPathnamesForTemplids(templids: number[]): Map<number, string> {
  const result = new Map<number, string>();
  if (templids.length === 0) return result;
  const db = getAppDb();
  const ph = templids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id, pathname FROM bol_sta_quiztemplate WHERE id IN (${ph})`).all(...templids) as {
    id: number;
    pathname: string;
  }[];
  for (const r of rows) result.set(r.id, r.pathname.replace(/\.3et$/, ""));
  return result;
}

/** get_templids_for_pathname_and_user(path, userid) — templates de un ejercicio para un usuario. */
export function getTemplidsForPathnameAndUser(pathname: string, userid: number): number[] {
  const db = getAppDb();
  const rows = db
    .prepare("SELECT id FROM bol_sta_quiztemplate WHERE pathname = ? AND userid = ?")
    .all(`${pathname}.3et`, userid) as { id: number }[];
  return rows.map((r) => r.id);
}

/** get_users_and_templ(path, classid) — alumnos (con plantillas) de un ejercicio en una clase. */
export function getUsersAndTempl(pathname: string, classid: number): Map<number, number[]> {
  const db = getAppDb();
  const rows = db
    .prepare(
      "SELECT bol_sta_quiztemplate.id, bol_sta_quiztemplate.userid FROM bol_sta_quiztemplate " +
        "JOIN bol_sta_quiz ON bol_sta_quiztemplate.id = bol_sta_quiz.templid " +
        "JOIN bol_userclass ON bol_sta_quiz.userid = bol_userclass.userid " +
        "WHERE bol_sta_quiztemplate.pathname = ? AND bol_userclass.classid = ?",
    )
    .all(`${pathname}.3et`, classid) as { id: number; userid: number }[];
  const result = new Map<number, number[]>();
  for (const r of rows.sort((a, b) => a.userid - b.userid)) {
    const list = result.get(r.userid) ?? [];
    list.push(r.id);
    result.set(r.userid, list);
  }
  return result;
}

export interface ScoreByDate {
  date: number;
  score: number;
  featpermin: number;
}

/** Mod_statistics::get_classes_for_pathname(exercise) — clases cuyo dirname coincide. */
export function getClassesForPathname(exercise: string): number[] {
  const db = getAppDb();
  const rows = db
    .prepare(
      "SELECT bol_classexercise.classid FROM bol_classexercise " +
        "JOIN bol_exercisedir ON bol_classexercise.pathid = bol_exercisedir.id " +
        "WHERE bol_exercisedir.pathname = ?",
    )
    .all(exercise.slice(0, exercise.lastIndexOf("/"))) as { classid: number }[];
  return rows.map((r) => r.classid);
}

/** Mod_statistics::may_see_nongraded(student, exercise, me) — acceso a notas sin calificar. */
export function maySeeNongraded(student: number, exercise: string, meId: number): boolean {
  if (meId === student) return true;
  const classes = getClassesForPathname(exercise);
  return gaveAccess(student, classes) > 0;
}

interface ScoreRow {
  id: number;
  start: number;
  duration: number;
  correct: number;
  cnt: number;
}

/**
 * get_score_by_date_user_templ(uid, templids, start, end, nongraded) —
 * rendimiento diario (clave = mediodía del día). Por día: [score %, featpermin].
 */
export function getScoreByDateUserTempl(
  uid: number,
  templids: number[],
  periodStart: number,
  periodEnd: number,
  nongraded: boolean,
): ScoreByDate[] {
  if (templids.length === 0) return [];
  const db = getAppDb();
  const ph = templids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT q.id, q.start, q.end - q.start AS duration, sum(rf.correct) AS correct, count(*) AS cnt ` +
        `FROM bol_sta_quiz q JOIN bol_sta_question quest ON quest.quizid = q.id ` +
        `JOIN bol_sta_requestfeature rf ON quest.id = rf.questid ` +
        `WHERE rf.userid = ? ${nongraded ? "" : "AND (q.grading IS NULL OR q.grading = 1) "}` +
        `AND q.templid IN (${ph}) AND q.start >= ? AND q.start <= ? AND q.end IS NOT NULL AND q.valid = 1 ` +
        `GROUP BY q.id`,
    )
    .all(uid, ...templids, periodStart, periodEnd) as ScoreRow[];
  const byDay = new Map<number, { correct: number; cnt: number; duration: number }>();
  for (const r of rows) {
    const day = StatisticsPeriod.roundToNoon(r.start);
    const acc = byDay.get(day) ?? { correct: 0, cnt: 0, duration: 0 };
    acc.correct += r.correct;
    acc.cnt += r.cnt;
    acc.duration += r.duration;
    byDay.set(day, acc);
  }
  const result: ScoreByDate[] = [];
  for (const [day, acc] of byDay) {
    const score = (100 * acc.correct) / acc.cnt;
    const featpermin = (60 * acc.cnt) / (acc.duration === 0 ? 1 : acc.duration);
    result.push({ date: day, score, featpermin });
  }
  return result.sort((a, b) => a.date - b.date);
}

/** get_features_by_date_user_templ(uid, templids, start, end, nongraded) — % por feature. */
export function getFeaturesByDateUserTempl(
  uid: number,
  templids: number[],
  periodStart: number,
  periodEnd: number,
  nongraded: boolean,
): Map<string, number> {
  const result = new Map<string, number>();
  if (templids.length === 0) return result;
  const db = getAppDb();
  const ph = templids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT rf.name AS rfname, sum(rf.correct) * 1.0 / count(*) * 100 AS pct ` +
        `FROM bol_sta_quiz q JOIN bol_sta_question quest ON quest.quizid = q.id ` +
        `JOIN bol_sta_requestfeature rf ON quest.id = rf.questid ` +
        `WHERE rf.userid = ? ${nongraded ? "" : "AND (q.grading IS NULL OR q.grading = 1) "}` +
        `AND q.templid IN (${ph}) AND q.start >= ? AND q.start <= ? AND q.end IS NOT NULL AND q.valid = 1 ` +
        `GROUP BY rfname`,
    )
    .all(uid, ...templids, periodStart, periodEnd) as { rfname: string; pct: number }[];
  for (const r of rows) result.set(r.rfname, r.pct);
  return result;
}

export interface QuizDurationRow {
  userid: number;
  templid: number;
  start: number;
  duration: number;
}

/** get_quizzes_duration(templids, start, end) — duraciones por quiz. */
export function getQuizzesDuration(templids: number[], start: number, end: number): QuizDurationRow[] {
  if (templids.length === 0) return [];
  const db = getAppDb();
  const ph = templids.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT userid, templid, start, end - start AS duration FROM bol_sta_quiz ` +
        `WHERE templid IN (${ph}) AND start >= ? AND start < ? AND end IS NOT NULL AND valid = 1`,
    )
    .all(...templids, start, end) as QuizDurationRow[];
}

/** purge(userid) — invalida todos los quizzes de un usuario. */
export function purge(userid: number): void {
  const db = getAppDb();
  db.prepare("UPDATE bol_sta_quiz SET valid = 0 WHERE userid = ? AND valid = 1").run(userid);
}

// ---------------------------------------------------------------------------
// Mod_grades (Ctrl_grades: tablas de notas por ejercicio y examen)
// ---------------------------------------------------------------------------

export interface ExamForClassRow {
  id: number;
  name: string;
}

/** Mod_grades::get_exams_for_class(classid). */
export function getExamsForClass(classid: number): ExamForClassRow[] {
  const db = getAppDb();
  return db
    .prepare("SELECT id, exam_name AS name FROM bol_exam_active WHERE class_id = ?")
    .all(classid) as ExamForClassRow[];
}

/** Mod_grades::check_if_enrolled(classid, userid). */
export function checkIfEnrolled(classid: number, userid: number): { id: number; classname: string } | undefined {
  const db = getAppDb();
  return db
    .prepare(
      "SELECT c.id, c.classname FROM bol_class c JOIN bol_userclass uc ON c.id = uc.classid WHERE uc.userid = ? AND c.id = ?",
    )
    .get(userid, classid) as { id: number; classname: string } | undefined;
}

/** Mod_grades::get_users_and_exam_results(activeexamid) — userids con resultados. */
export function getUsersAndExamResults(activeexamid: number): number[] {
  const db = getAppDb();
  const rows = db
    .prepare("SELECT DISTINCT userid FROM bol_exam_results WHERE activeexamid = ?")
    .all(activeexamid) as { userid: number }[];
  return rows.map((r) => r.userid);
}

export interface GradeAttempt {
  id: number;
  userid: number;
  start: number;
  duration: number;
  correct: number;
  cnt: number;
  perc: number;
  featpermin: number;
}

interface GradeRow {
  id: number;
  userid: number;
  start: number;
  duration: number;
  correct: number;
  cnt: number;
  perc: number;
}

/**
 * Mod_grades::get_score_by_date_user_templ(..., calculate_percentages=true) —
 * mejor intento por día; base del % = tot_questions. Resultado: [{date, ...}].
 */
export function getScoreByDateUserTemplGrades(
  uid: number,
  templids: number[],
  periodStart: number,
  periodEnd: number,
  nongraded: boolean,
): ScoreByDate[] {
  const attempts = getScoreByUserTempl(uid, templids, periodStart, periodEnd, nongraded);
  const byDay = new Map<number, GradeAttempt>();
  for (const a of attempts.sort((x, y) => y.perc - x.perc)) {
    const day = StatisticsPeriod.roundToNoon(a.start);
    if (!byDay.has(day)) byDay.set(day, a);
  }
  return [...byDay.values()]
    .map((a) => ({ date: StatisticsPeriod.roundToNoon(a.start), score: a.perc, featpermin: a.featpermin }))
    .sort((a, b) => a.date - b.date);
}

/** Mod_grades::get_score_by_user_templ — intentos por quiz (clave = start exacto). */
export function getScoreByUserTempl(
  uid: number,
  templids: number[],
  periodStart: number,
  periodEnd: number,
  nongraded: boolean,
): GradeAttempt[] {
  if (templids.length === 0) return [];
  const db = getAppDb();
  const ph = templids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT rf.userid, q.id, q.start, q.end - q.start AS duration, sum(rf.correct) AS correct, ` +
        `q.tot_questions AS cnt, sum(rf.correct) * 1.0 / q.tot_questions * 100 AS perc ` +
        `FROM bol_sta_quiz q JOIN bol_sta_question quest ON quest.quizid = q.id ` +
        `JOIN bol_sta_requestfeature rf ON quest.id = rf.questid ` +
        `WHERE rf.userid = ? ${nongraded ? "" : "AND (q.grading IS NULL OR q.grading = 1) "}` +
        `AND q.templid IN (${ph}) AND q.start >= ? AND q.start <= ? AND q.end IS NOT NULL AND q.valid = 1 ` +
        `GROUP BY rf.userid, q.id ORDER BY perc DESC`,
    )
    .all(uid, ...templids, periodStart, periodEnd) as GradeRow[];
  return rows.map((r) => ({ ...r, featpermin: r.duration > 0 ? (60 * r.cnt) / r.duration : 0 }));
}

export interface ExamAttempt extends GradeAttempt {
  weight: number;
  exerciseName: string;
}

/** Mod_grades::get_score_by_user_active_exam — resultados por examen (con pesos del examcode). */
export function getScoreByUserActiveExam(
  uid: number,
  examids: number[],
  nongraded: boolean,
): ExamAttempt[] {
  if (examids.length === 0) return [];
  const db = getAppDb();
  const ph = examids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT rf.userid, q.id, q.start, q.end - q.start AS duration, sum(rf.correct) AS correct, ` +
        `q.tot_questions AS cnt, sum(rf.correct) * 1.0 / q.tot_questions * 100 AS perc, ex.examcode ` +
        `FROM bol_exam_results er JOIN bol_exam_active exa ON exa.id = er.activeexamid ` +
        `JOIN bol_exam ex ON exa.exam_id = ex.id ` +
        `JOIN bol_sta_quiz q ON q.id = er.quizid ` +
        `JOIN bol_sta_question quest ON quest.quizid = q.id ` +
        `JOIN bol_sta_requestfeature rf ON quest.id = rf.questid ` +
        `WHERE rf.userid = ? ${nongraded ? "" : "AND (q.grading IS NULL OR q.grading = 1) "}` +
        `AND er.activeexamid IN (${ph}) AND q.end IS NOT NULL AND q.valid = 1 ` +
        `GROUP BY rf.userid, q.id, ex.examcode`,
    )
    .all(uid, ...examids) as (GradeRow & { examcode: string })[];
  return rows.map((r) => {
    const parsed = parseExamCode(r.examcode);
    const ex = parsed.exercises.find((e) => e.exercisename === quizTemplatePath(r.id)) ?? parsed.exercises[0];
    return {
      id: r.id,
      userid: r.userid,
      start: r.start,
      duration: r.duration,
      correct: r.correct,
      cnt: r.cnt,
      perc: r.perc,
      featpermin: r.duration > 0 ? (60 * r.cnt) / r.duration : 0,
      weight: ex?.weight ?? 1,
      exerciseName: ex?.exercisename ?? "",
    };
  });
}

/** Mod_grades::get_features_by_date_exam_result — % por feature en exámenes. */
export function getFeaturesByDateExamResult(
  uid: number,
  examids: number[],
  nongraded: boolean,
): Map<string, number> {
  const result = new Map<string, number>();
  if (examids.length === 0) return result;
  const db = getAppDb();
  const ph = examids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT rf.name AS rfname, sum(rf.correct) * 1.0 / count(*) * 100 AS pct ` +
        `FROM bol_exam_results er JOIN bol_exam_active exa ON exa.id = er.activeexamid ` +
        `JOIN bol_sta_quiz q ON q.id = er.quizid ` +
        `JOIN bol_sta_question quest ON quest.quizid = q.id ` +
        `JOIN bol_sta_requestfeature rf ON quest.id = rf.questid ` +
        `WHERE rf.userid = ? ${nongraded ? "" : "AND (q.grading IS NULL OR q.grading = 1) "}` +
        `AND er.activeexamid IN (${ph}) AND q.end IS NOT NULL AND q.valid = 1 ` +
        `GROUP BY rfname`,
    )
    .all(uid, ...examids) as { rfname: string; pct: number }[];
  for (const r of rows) result.set(r.rfname, r.pct);
  return result;
}

export interface QuizDetailRow {
  quizid: number;
  questid: number;
  qono: number;
  time: number;
  correct: number;
  location: string;
  name: string;
  value: string;
  answer: string;
  subqono: number;
  txt: string;
  disp_type: string | null;
  disp_value: string | null;
}

/** Mod_grades::get_quizz_detail(uid, quizzid) — detalle por pregunta de un quiz. */
export function getQuizDetail(uid: number, quizzid: number): QuizDetailRow[] {
  const db = getAppDb();
  return db
    .prepare(
      `SELECT sq.quizid, rf.questid, ` +
        `DENSE_RANK() OVER (PARTITION BY sq.quizid ORDER BY rf.questid) AS qono, ` +
        `sq.time, rf.correct, sq.location, rf.name, rf.value, rf.answer, ` +
        `rf.qono AS subqono, sq.txt, ` +
        `GROUP_CONCAT(df.name) AS disp_type, GROUP_CONCAT(df.value) AS disp_value ` +
        `FROM bol_sta_quiz q JOIN bol_sta_question sq ON sq.quizid = q.id ` +
        `JOIN bol_sta_requestfeature rf ON rf.questid = sq.id ` +
        `JOIN bol_sta_displayfeature df ON rf.questid = df.questid AND rf.qono = df.qono ` +
        `WHERE sq.quizid = ? AND q.userid = ? GROUP BY rf.id, rf.questid, rf.qono`,
    )
    .all(quizzid, uid) as QuizDetailRow[];
}

/** Pathname relativo (sin .3et) del template del quiz dado. */
export function quizTemplatePath(quizid: number): string {
  const db = getAppDb();
  const row = db
    .prepare(
      "SELECT pathname FROM bol_sta_quiztemplate WHERE id = (SELECT templid FROM bol_sta_quiz WHERE id = ?)",
    )
    .get(quizid) as { pathname: string } | undefined;
  return row ? row.pathname.replace(/\.3et$/, "") : "";
}