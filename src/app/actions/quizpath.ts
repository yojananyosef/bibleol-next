"use server";

import { createQuizPath, getClassesForUser } from "@/lib/services/quizpath";
import { checkLoggedIn } from "@/lib/auth/guards";
import type { DirList } from "@/lib/services/quizpath";

export type QuizDirActionResult = { ok?: true; data?: DirList; error?: string };

/** dirlist de Mod_quizpath sobre el path relativo pedido. */
export async function listQuizDirAction(relativePath: string): Promise<QuizDirActionResult> {
  const me = await checkLoggedIn();
  try {
    const qp = createQuizPath(true);
    qp.init(relativePath, true, true, getClassesForUser(me.id ?? 0));
    return { ok: true, data: qp.dirlist(false) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
