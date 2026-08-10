/**
 * services/statistics.ts — Réplica 1:1 de `models/Mod_statistics.php`
 * (parte quiz: hashCode, newQuizTemplate, startQuiz) sobre la BD de
 * aplicación (tablas bol_sta_quiztemplate, bol_sta_quiz, bol_sta_universe).
 */

import { getAppDb } from "../db/sqlite.ts";

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