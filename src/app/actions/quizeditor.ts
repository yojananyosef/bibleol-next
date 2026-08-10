"use server";

// Acciones del editor de ejercicios (port de Ctrl_text: edit_quiz / new_quiz /
// check_submit_quiz / submit_quiz / test_quiz).

import { checkTeacher, currentUserOrDummy } from "@/lib/auth/guards";
import { isTeacher, isAdmin } from "@/lib/services/users";
import {
  checkQuizName,
  quizEditorData,
  submitQuiz,
  testQuiz,
  type CheckNameStatus,
  type QuizEditorDataPayload,
} from "@/lib/services/quizeditor";

export type QuizEditorDataResult = { ok?: true; data?: QuizEditorDataPayload; error?: string };
export type CheckNameResult = { ok?: true; status?: CheckNameStatus; error?: string };
export type QuizSubmitResult = { ok?: true; dir?: string; quizPath?: string; error?: string };

/** Datos de la página del editor (edit_quiz / new_quiz). */
export async function getQuizEditorDataAction(opts: {
  quiz?: string;
  dir?: string;
  db?: string;
}): Promise<QuizEditorDataResult> {
  await checkTeacher();
  try {
    const data = quizEditorData({
      quiz: opts.quiz ?? null,
      dir: opts.dir ?? null,
      db: opts.db ?? null,
    });
    return { ok: true, data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** check_submit_quiz: valida el nombre de archivo. */
export async function checkQuizNameAction(dir: string, quiz: string): Promise<CheckNameResult> {
  const me = await checkTeacher();
  try {
    return checkQuizName(dir, quiz, me);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** submit_quiz: guarda el ejercicio y su límite de tiempo. */
export async function submitQuizAction(opts: {
  dir: string;
  quiz: string;
  quizdata: string;
  minutes: number;
  seconds: number;
}): Promise<QuizSubmitResult> {
  const me = await checkTeacher();
  try {
    return submitQuiz({ ...opts, me });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** test_quiz: empaqueta el ejercicio y devuelve la ruta para probarlo. */
export async function testQuizAction(opts: {
  dir: string;
  quiz: string;
  quizdata: string;
  minutes: number;
  seconds: number;
}): Promise<QuizSubmitResult> {
  const me = await checkTeacher();
  try {
    return testQuiz({ ...opts, me });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Para el cliente: ¿es profesor? (controla los enlaces "New exercise"/"Edit"). */
export async function isTeacherAction(): Promise<boolean> {
  const me = await currentUserOrDummy();
  return isTeacher(me) || isAdmin(me);
}