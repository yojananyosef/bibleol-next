"use server";

import { checkLoggedIn } from "@/lib/auth/guards";
import { getAppDb } from "@/lib/db/sqlite";
import { endQuiz, type EndQuizPayload } from "@/lib/services/statistics";

export type StatActionResult = { ok?: true; error?: string };

/** Mod_exams::get_template_id — templid del bol_sta_quiz. */
function getTemplateId(quizid: number): number | null {
  const db = getAppDb();
  const row = db.prepare("SELECT templid FROM bol_sta_quiz WHERE id = ?").get(quizid) as
    | { templid: number }
    | undefined;
  return row ? row.templid : null;
}

/**
 * Ctrl_statistics::update_stat — el cliente del quiz envía las estadísticas
 * al terminar (JSON serializable con el mismo formato que el legacy TS).
 */
export async function updateStatAction(payload: EndQuizPayload): Promise<StatActionResult> {
  const me = await checkLoggedIn();
  if (!me.id) return { ok: true }; // Sin sesión no hay estadísticas que guardar (1:1)
  endQuiz(me.id, payload);
  return { ok: true };
}

/**
 * Ctrl_statistics::update_exam_quiz_stat — registra el resultado de un quiz
 * en modo examen y marca el examen como finalizado si no quedan ejercicios.
 */
export async function updateExamQuizStatAction(
  examid: number,
  quizid: number,
  exerciseLst: string,
): Promise<StatActionResult> {
  const me = await checkLoggedIn();
  if (!me.id) return { ok: true };

  const db = getAppDb();
  const templid = getTemplateId(quizid);

  db.prepare(
    "INSERT INTO bol_exam_results (userid, activeexamid, quizid, quiztemplid) VALUES (?, ?, ?, ?)",
  ).run(me.id, examid, quizid, templid ?? 0);

  if (!exerciseLst) {
    db.prepare("INSERT INTO bol_exam_finished (userid, activeexamid) VALUES (?, ?)").run(me.id, examid);
  }

  return { ok: true };
}
