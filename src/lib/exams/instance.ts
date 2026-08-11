/**
 * exams/instance.ts — Estado de una instancia de examen para un usuario
 * (1:1 con `Ctrl_exams::take_exam()` + la tabla bol_exam_status).
 *
 * El deadline se calcula UNA sola vez (en la primera entrada a take_exam) y se
 * persiste en bol_exam_status; al reanudar se usa el persistido.
 */

export interface ActiveExamRow {
  id: number;
  exam_name: string;
  class_id: number;
  exam_start_time: number;
  exam_end_time: number;
  exam_length: number | null;
  exam_id: number;
  instance_name: string;
}

export interface ExamStatusRow {
  id: number;
  userid: number;
  activeexamid: number;
  start_time: number;
  deadline: number;
}

/**
 * deadline del legacy (Ctrl_exams::take_exam): min(end_time, now + length×60s);
 * para profesores siempre exam_end_time. (El comentario del esquema dice
 * "start+duration", pero el código usa `now` — se replica el código.)
 */
export function examDeadline(now: number, active: ActiveExamRow, isTeacher: boolean): number {
  if (isTeacher) return active.exam_end_time;
  return Math.min(active.exam_end_time, now + (active.exam_length ?? 0) * 60);
}

/** Clasificación de una instancia respecto al momento actual. */
export function examStage(now: number, active: ActiveExamRow): "future" | "active" | "past" {
  if (active.exam_start_time > now) return "future";
  if (active.exam_end_time <= now) return "past";
  return "active";
}