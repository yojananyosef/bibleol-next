"use server";

// Acciones de FASE 7 — exámenes (port de Ctrl_exams + Mod_exams).
// Mismas guardas que el legacy: check_teacher en la gestión, check_logged_in
// en el flujo del alumno, owner del examen para editar (1:1: fallo → silencioso).

import { checkLoggedIn, checkTeacher } from "@/lib/auth/guards";
import * as ex from "@/lib/services/exams";
import { parseExamCode, displayExamName, type ExamExercise } from "@/lib/exams/exam-xml";
import * as users from "@/lib/services/users";
import { getNamedClassesOwned } from "@/lib/services/classes";

export type ExamsResult = { ok?: true; error?: string; data?: unknown };

function err(e: unknown): ExamsResult {
  return { error: e instanceof Error ? e.message : String(e) };
}

function ownerOrError(examid: number, me: users.UserRow): { ok?: true } | ExamsResult | ex.ExamRow {
  const exam = ex.getExamById(examid);
  if (!exam) return err("no_exam");
  if (exam.ownerid !== (me.id ?? 0)) return err(ex.MSG_EXAMS.notExamOwner);
  return exam;
}

/** Datos de manage_exams: exámenes + clases del profesor (para crear instancia). */
export async function getManageExamsAction(): Promise<ExamsResult> {
  try {
    const me = await checkTeacher();
    const isAdminUser = users.isAdmin(me);
    return {
      ok: true,
      data: {
        exams: ex.getExams().map((e) => ({
          ...e,
          display_name: displayExamName(e.exam_name),
          owner_name: e.ownerid === 0 ? "" : users.userFullName(e.ownerid),
          can_edit: isAdminUser || e.ownerid === (me.id ?? 0),
        })),
        classes: getNamedClassesOwned(me, isAdminUser).map((c) => ({ id: c.clid, name: c.classname })),
        myid: me.id ?? 0,
        isadmin: isAdminUser,
      },
    };
  } catch (e) {
    return err(e);
  }
}

/** create_exam — crea el examen maestro con el XML de los ejercicios elegidos. */
export async function createExamAction(form: FormData): Promise<ExamsResult> {
  try {
    const me = await checkTeacher();
    const examname = String(form.get("examname") ?? "").trim();
    const files = form.getAll("file").map(String).filter((f) => f.length > 0);
    if (!examname) return err("missing_exam_name");
    if (files.length === 0) return err("no_exercise_selected");
    const exam = ex.createExam(me.id ?? 0, examname, files);
    return { ok: true, data: { id: exam.id } };
  } catch (e) {
    return err(e);
  }
}

/** Datos de edit_exam (solo owner; legacy: redirect silencioso). */
export async function getEditExamAction(examid: number): Promise<ExamsResult> {
  try {
    const me = await checkTeacher();
    const exam = ex.getExamById(examid);
    if (!exam) return err("no_exam");
    if (exam.ownerid !== (me.id ?? 0) && !users.isAdmin(me)) return err(ex.MSG_EXAMS.notExamOwner);
    const code = parseExamCode(exam.examcode);
    return {
      ok: true,
      data: {
        id: exam.id,
        exam_name: displayExamName(exam.exam_name),
        teacher_id: code.teacher_id,
        description: code.description,
        exercises: code.exercises.map((x: ExamExercise) => ({ ...x, exercisename: displayExamName(x.exercisename) })),
      },
    };
  } catch (e) {
    return err(e);
  }
}

/** save_exam — los inputs del form se llaman {exercisename}numq / {exercisename}weight (1:1). */
export async function saveExamAction(form: FormData): Promise<ExamsResult> {
  try {
    const me = await checkTeacher();
    const examid = Number(form.get("id") ?? 0);
    const owner = ownerOrError(examid, me);
    if (!("examcode" in (owner as ex.ExamRow))) return owner as ExamsResult;
    const exam = owner as ex.ExamRow;

    const current = parseExamCode(exam.examcode);
    const exercises: ExamExercise[] = current.exercises.map((x) => {
      const numq = Number(form.get(`${x.exercisename}numq`) ?? x.numq);
      const weight = Number(form.get(`${x.exercisename}weight`) ?? x.weight);
      return { ...x, numq: numq > 0 ? numq : x.numq, weight: weight > 0 ? weight : x.weight };
    });

    ex.saveExam(examid, {
      examname: String(form.get("exam_name") ?? current.examname).replace(/\+/g, "%2B"),
      teacher_id: Number(form.get("teacher_id") ?? current.teacher_id) || current.teacher_id,
      description: String(form.get("description") ?? current.description),
      exercises,
    });
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** delete_exam — soft delete (archived=1), 1:1. */
export async function deleteExamAction(form: FormData): Promise<ExamsResult> {
  try {
    const me = await checkTeacher();
    const examid = Number(form.get("id") ?? 0);
    const owner = ownerOrError(examid, me);
    if (!("examcode" in (owner as ex.ExamRow))) return owner as ExamsResult;
    ex.deleteExam(examid);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** create_exam_instance — ventana/fechas en unix (offset del navegador ya aplicado). */
export async function createExamInstanceAction(form: FormData): Promise<ExamsResult> {
  try {
    const me = await checkTeacher();
    const examid = Number(form.get("exam_id") ?? 0);
    const owner = ownerOrError(examid, me);
    if (!("examcode" in (owner as ex.ExamRow))) return owner as ExamsResult;
    const exam = owner as ex.ExamRow;

    const classId = Number(form.get("class_id") ?? 0);
    const startTime = Number(form.get("exam_start_time") ?? 0);
    const endTime = Number(form.get("exam_end_time") ?? 0);
    const duration = Number(form.get("exam_length") ?? 90);
    const instanceName = String(form.get("instance_name") ?? exam.exam_name).trim();
    if (!instanceName) return err("invalid_name");
    if (duration < 1) return err("invalid_duration");
    if (!classId || !startTime || !endTime) return err("invalid_class");
    if (endTime <= startTime) return err("invalid_class");

    ex.createExamInstance(exam.exam_name, classId, startTime, endTime, duration, examid, instanceName);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** delete_exam_instance — borra la instancia (cascada). */
export async function deleteExamInstanceAction(form: FormData): Promise<ExamsResult> {
  try {
    await checkTeacher();
    ex.deleteExamInstance(Number(form.get("id") ?? 0));
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** active_exams — instancias por clase (Active/Future), con finished por usuario. */
export async function getActiveExamsAction(): Promise<ExamsResult> {
  try {
    const me = await checkLoggedIn();
    const { classes, instances } = ex.getExamInstancesForUser(me);
    const now = Math.floor(Date.now() / 1000);
    const data = classes.map((c) => ({
      class: c,
      instances: (instances[c.id] ?? []).map((r) => {
        const stage = r.exam_start_time > now ? "future" : r.exam_end_time <= now ? "past" : "active";
        return {
          id: r.id,
          exam_name: r.exam_name,
          instance_name: r.instance_name,
          exam_start_time: r.exam_start_time,
          exam_end_time: r.exam_end_time,
          exam_length: r.exam_length,
          exam_id: r.exam_id,
          finished: r.finished,
          stage,
          takeable: stage === "active" && !r.finished,
          teacher: users.isTeacher(me) || users.isAdmin(me),
        };
      }),
    }));
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

/** take_exam — ejercicios pendientes + deadline persistido. */
export async function getTakeExamAction(activeexamid: number): Promise<ExamsResult> {
  try {
    const me = await checkLoggedIn();
    const t = ex.takeExamData(me, activeexamid);
    return {
      ok: true,
      data: {
        id: activeexamid,
        exam_name: t.active.exam_name,
        instance_name: t.active.instance_name,
        exercises: t.exercises,
        start_time: t.status.start_time,
        deadline: t.status.deadline,
      },
    };
  } catch (e) {
    return err(e);
  }
}

/** Exam complete — endereza a /exams/done (1:1 con view_exam_done). */
export async function examFinishedAction(activeexamid: number): Promise<ExamsResult> {
  try {
    const me = await checkLoggedIn();
    void me;
    void activeexamid;
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}
/** getDirContents — contenido de un nivel (exploración tipo file_manager). */
/** getDirContents — contenido de un nivel (exploración tipo file_manager). */
export async function getDirContentsAction(dir: string): Promise<ExamsResult> {
  try {
    await checkTeacher();
    const { createQuizPath } = await import("@/lib/services/quizpath");
    const qp = createQuizPath(false);
    qp.init(dir === "" ? "" : dir, true, false, []);
    const dl = qp.dirlist(false);
    return {
      ok: true,
      data: {
        relativedir: dl.relativedir,
        parentdir: dl.parentdir,
        dirs: dl.directories.map(([name]) => name),
        files: dl.files.map((f) => f.filename),
      },
    };
  } catch (e) {
    return err(e);
  }
}
