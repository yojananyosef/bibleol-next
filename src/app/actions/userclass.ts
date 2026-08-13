"use server";

// Acciones de Ctrl_userclass (FASE 6/7) — asignación de usuarios a clases.

import { checkTeacher } from "@/lib/auth/guards";
import * as uc from "@/lib/services/userclass";

export type UcResult = { ok?: true; error?: string; data?: unknown };

function err(e: unknown): UcResult {
  return { error: e instanceof Error ? e.message : String(e) };
}

/** Datos de Ctrl_userclass::classes_for_user (guardas + clases owned). */
export async function getClassesForUserAction(userid: number): Promise<UcResult> {
  try {
    const me = await checkTeacher();
    const data = uc.classesForUser(userid, me);
    if (!data.userInfo) return { error: uc.MSG_USERCLASS.illegalUserId };
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

/** POST de classes_for_user — sincroniza las clases marcadas (solo owned). */
export async function updateClassesForUserAction(form: FormData): Promise<UcResult> {
  try {
    const me = await checkTeacher();
    const userid = Number(form.get("userid"));
    const raw = form.getAll("foruser[]").map((v) => Number(v));
    const newClasses = [...new Set(raw.filter((v) => Number.isInteger(v) && v > 0))];
    const data = uc.classesForUser(userid, me);
    if (!data.userInfo) return { error: uc.MSG_USERCLASS.illegalUserId };
    uc.updateClassesForUser(userid, data.oldClasses, newClasses, data.ownedClasses);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}