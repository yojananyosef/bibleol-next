/**
 * services/exams.ts — Réplica de `models/Mod_exams.php` + la lógica de
 * `controllers/Ctrl_exams.php` (tablas bol_exam, bol_exam_active,
 * bol_exam_status, bol_exam_results, bol_exam_finished).
 */

import { getAppDb } from "../db/sqlite.ts";
import { DataException } from "../errors.ts";
import { buildExamCode, examCodeHash, parseExamCode, type ExamCode, type ExamExercise } from "../exams/exam-xml.ts";
import { getNamedClassesOwned, getClassById } from "./classes.ts";
import { getClassesForUser } from "./userclass.ts";
import { userFullName, isTeacher, isAdmin, type UserRow } from "./users.ts";
import type { ActiveExamRow, ExamStatusRow } from "../exams/instance.ts";
import { examDeadline } from "../exams/instance.ts";

export const MSG_EXAMS = {
  illegalCharFolderName: "illegal_char_folder_name",
  notExamOwner: "not_exam_owner",
  noExam: "no_exam",
  noActiveExam: "no_active_exam",
} as const;

/** Nombre prohibido (Ctrl_exams::create_exam 1:1). */
const ILLEGAL_NAME = /[/?*;{}"'|]/;

export interface ExamRow {
  id: number;
  exam_name: string;
  ownerid: number;
  examcode: string;
  examcodehash: string;
  archived: number;
}

const examCols = "id, exam_name, ownerid, examcode, examcodehash, archived";

function rowToExam(row: unknown): ExamRow | null {
  if (!row) return null;
  return row as unknown as ExamRow;
}

/** Mod_exams::get_exam_by_id. */
export function getExamById(id: number): ExamRow | null {
  return rowToExam(getAppDb().prepare(`SELECT ${examCols} FROM bol_exam WHERE id = ?`).get(id));
}

/** Mod_exams::get_all_exams — solo no archivados. */
export function getExams(): ExamRow[] {
  return getAppDb().prepare(`SELECT ${examCols} FROM bol_exam WHERE archived = 0 ORDER BY exam_name`).all() as ExamRow[];
}

/** create_exam: valida el nombre y crea el examen maestro a partir del XML. */
export function createExam(ownerid: number, examName: string, files: string[], description?: string): ExamRow {
  if (ILLEGAL_NAME.test(examName)) throw new DataException(MSG_EXAMS.illegalCharFolderName);
  const examcode = buildExamCode({
    examname: examName,
    teacher_id: ownerid,
    description: description ?? "Description",
    exercises: files.map((f) => ({ exercisename: f, numq: 10, weight: 1, params: {} })),
  });
  const db = getAppDb();
  const res = db
    .prepare("INSERT INTO bol_exam (exam_name, ownerid, examcode, examcodehash) VALUES (?, ?, ?, ?)")
    .run(examName, ownerid, examcode, examCodeHash(examcode));
  return getExamById(Number(res.lastInsertRowid))!;
}

/** save_exam: sobrescribe exam_name/teacher_id/description/exercises (1:1 con el POST). */
export function saveExam(examid: number, code: ExamCode): ExamRow {
  const examcode = buildExamCode(code);
  getAppDb()
    .prepare("UPDATE bol_exam SET exam_name = ?, ownerid = ?, examcode = ?, examcodehash = ? WHERE id = ?")
    .run(code.examname, code.teacher_id, examcode, examCodeHash(examcode), examid);
  return getExamById(examid)!;
}

/** delete_exam — soft delete (archived=1), 1:1 con el legacy. */
export function deleteExam(examid: number): void {
  getAppDb().prepare("UPDATE bol_exam SET archived = 1 WHERE id = ?").run(examid);
}

/** Instancia activa por id. */
export function getActiveExamById(id: number): ActiveExamRow | null {
  return getAppDb().prepare("SELECT * FROM bol_exam_active WHERE id = ?").get(id) as ActiveExamRow | null;
}

/**
 * create_exam_instance — ventana [start,end] en unix (ya convertida con el
 * offset del navegador) + duración en minutos. Sin validación server de
 * propiedad en el legacy; aquí se replica (la clase viene del select propio).
 */
export function createExamInstance(
  examName: string,
  classId: number,
  startTime: number,
  endTime: number,
  durationMinutes: number,
  examId: number,
  instanceName: string,
): void {
  getAppDb()
    .prepare(
      "INSERT INTO bol_exam_active (exam_name, class_id, exam_start_time, exam_end_time, exam_length, exam_id, instance_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(examName, classId, startTime, endTime, durationMinutes, examId, instanceName);
}

/** delete_exam_instance — borra la instancia (cascada: status/results/finished). */
export function deleteExamInstance(id: number): void {
  getAppDb().prepare("DELETE FROM bol_exam_active WHERE id = ?").run(id);
}

/** Instancias de las clases del usuario (profesor: owned; alumno: inscritas). */
export function getExamInstancesForUser(me: UserRow): {
  classes: Array<{ id: number; name: string; instructor: string }>;
  instances: Record<number, Array<ActiveExamRow & { finished: boolean }>>;
} {
  const db = getAppDb();
  const isTeacherUser = isTeacher(me) || isAdmin(me);
  const classIds = isTeacherUser
    ? getNamedClassesOwned(me, isAdmin(me)).map((c) => c.clid)
    : getClassesForUser(me.id ?? 0);

  const classes = classIds
    .map((clid) => {
      const cl = getClassById(clid, me);
      if (!cl) return null;
      return { id: clid, name: cl.classname, instructor: cl.ownerid === 0 ? "None" : userFullName(cl.ownerid) };
    })
    .filter((c): c is { id: number; name: string; instructor: string } => c !== null);

  const instances: Record<number, Array<ActiveExamRow & { finished: boolean }>> = {};
  for (const c of classes) {
    const rows = db.prepare("SELECT * FROM bol_exam_active WHERE class_id = ?").all(c.id) as ActiveExamRow[];
    instances[c.id] = rows.map((r) => ({
      ...r,
      finished: examFinished(me.id ?? 0, r.id),
    }));
  }
  return { classes, instances };
}

/** Mod_exams::exam_finished — ¿el usuario terminó la instancia? */
export function examFinished(userid: number, activeexamid: number): boolean {
  return (
    getAppDb().prepare("SELECT 1 FROM bol_exam_finished WHERE userid = ? AND activeexamid = ?").get(userid, activeexamid) !==
    undefined
  );
}

/** Mod_exams::get_completed_exam_exercises — pathnames de los ejercicios completados. */
export function getCompletedExamExercises(userid: number, activeexamid: number): string[] {
  const db = getAppDb();
  const rows = db
    .prepare("SELECT quiztemplid FROM bol_exam_results WHERE userid = ? AND activeexamid = ?")
    .all(userid, activeexamid) as Array<{ quiztemplid: number }>;
  const out: string[] = [];
  for (const r of rows) {
    const t = db.prepare("SELECT pathname FROM bol_sta_quiztemplate WHERE id = ?").get(r.quiztemplid) as
      | { pathname: string }
      | undefined;
    if (t) out.push(t.pathname);
  }
  return out;
}

/** Estado (start_time/deadline) del examen para el usuario; lo crea si no existe. */
export function getOrCreateExamStatus(userid: number, activeexamid: number, deadline: number): ExamStatusRow {
  const db = getAppDb();
  const existing = db.prepare("SELECT * FROM bol_exam_status WHERE userid = ? AND activeexamid = ?").get(userid, activeexamid) as
    | ExamStatusRow
    | undefined;
  if (existing) return existing;
  const now = Math.floor(Date.now() / 1000);
  const res = db
    .prepare("INSERT INTO bol_exam_status (userid, activeexamid, start_time, deadline) VALUES (?, ?, ?, ?)")
    .run(userid, activeexamid, now, deadline);
  return db.prepare("SELECT * FROM bol_exam_status WHERE id = ?").get(Number(res.lastInsertRowid)) as ExamStatusRow;
}

/**
 * take_exam (1:1 con Ctrl_exams::take_exam): ejercicios pendientes del
 * alumno/profesor + deadline persistido.
 */
export function takeExamData(
  me: UserRow,
  activeexamid: number,
): { active: ActiveExamRow; status: ExamStatusRow; exercises: Array<{ name: string; numq: number }> } {
  const active = getActiveExamById(activeexamid);
  if (!active) throw new DataException(MSG_EXAMS.noActiveExam);

  // El alumno que ya terminó no puede retomar (1:1 con take_exam).
  const teacherDidIt = isTeacher(me) || isAdmin(me);
  if (!teacherDidIt && examFinished(me.id ?? 0, activeexamid)) {
    throw new DataException(MSG_EXAMS.noActiveExam);
  }

  const examXml = getExamById(active.exam_id)?.examcode;
  const exam = examXml ? parseExamCode(examXml) : { exercises: [] as ExamExercise[] };
  const deadline = examDeadline(Math.floor(Date.now() / 1000), active, teacherDidIt);
  const status = getOrCreateExamStatus(me.id ?? 0, activeexamid, deadline);

  const completed = teacherDidIt ? [] : getCompletedExamExercises(me.id ?? 0, activeexamid);
  const exercises = exam.exercises
    .filter((ex) => !completed.includes(ex.exercisename))
    .map((ex) => ({ name: ex.exercisename, numq: ex.numq > 0 ? ex.numq : 10 }));

  return { active, status, exercises };
}
