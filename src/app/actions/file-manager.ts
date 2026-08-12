"use server";

// Acciones de FASE 9 — file manager (port de Ctrl_file_manager + Ctrl_upload).
// Guardas 1:1 con el legacy: check_teacher en todas, check_admin en chown y
// update_ownership. Copiar/mover usa la cookie firmada ol_fm (sesión CI).

import { checkAdmin, checkTeacher, sessionLanguage } from "@/lib/auth/guards";
import {
  QuizPathError,
  createQuizPath,
  fixExerciseowner,
  getClassesForDir,
  insertFiles,
  insertPassages,
  updateClassesForDir,
  type DirList,
} from "@/lib/services/quizpath";
import { getDbAndBooks } from "@/lib/services/corpus";
import { clearFmSession, getFmSession, setFmSession } from "@/lib/auth/fm-session";
import * as users from "@/lib/services/users";

export type FileManagerResult = { ok?: true; error?: string; data?: unknown };

function err(e: unknown): FileManagerResult {
  return { error: e instanceof Error ? e.message : String(e) };
}

function fmError(msg: string): never {
  throw new QuizPathError(msg);
}

function checkName(name: string): void {
  if (/[/?*;{}"'\\]/.test(name)) fmError("Illegal character in folder name");
}

/** Datos de /file_manager (1:1 con show_files_2: dirlist + bd + teachers + op). */
export async function getFileManagerDataAction(dir: string): Promise<FileManagerResult> {
  try {
    const me = await checkTeacher();
    const lang = await sessionLanguage();
    const qp = createQuizPath(false);
    qp.init(dir, true, false, []);
    const dirlist = qp.dirlist(false);
    const isadmin = users.isAdmin(me);
    const teachers = (isadmin ? users.getTeachers() : []).map((t) => ({
      id: t.id,
      fullname: users.makeFullName(t),
    }));
    const copyOrMove = await getFmSession();
    return {
      ok: true,
      data: {
        dirlist,
        isTop: qp.isTop(),
        databases: getDbAndBooks(lang),
        isadmin,
        teachers,
        copyOrMove,
        owners: ownerNames(dirlist),
      },
    };
  } catch (e) {
    return err(e);
  }
}

/** username por fichero (LEFT JOIN user del legacy; '' si el owner no existe). */
function ownerNames(dirlist: DirList): Record<string, string> {
  const res: Record<string, string> = {};
  for (const f of dirlist.files) {
    if (f.userid === null || f.userid === 0) res[f.filename] = "";
    else {
      try {
        res[f.filename] = users.userFullName(f.userid);
      } catch {
        res[f.filename] = "";
      }
    }
  }
  return res;
}

/** create_folder — valida y crea el directorio bajo dir. */
export async function createFolderAction(dir: string, create: string): Promise<FileManagerResult> {
  try {
    await checkTeacher();
    const name = create.trim();
    checkName(name);
    const qp = createQuizPath(false);
    qp.init(dir, true, false, []);
    qp.mkdir(name);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** delete_folder — borra el directorio (solo si está vacío). */
export async function deleteFolderAction(dir: string, folder: string): Promise<FileManagerResult> {
  try {
    await checkTeacher();
    const qp = createQuizPath(false);
    qp.init(dir, true, false, []);
    qp.rmdir(folder);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** copy_delete_files — copy/move (sesión), delete o chown sobre los marcados. */
export async function copyDeleteFilesAction(
  dir: string,
  files: string[],
  operation: string,
  newowner: string,
): Promise<FileManagerResult> {
  try {
    const me = await checkTeacher();
    const isadmin = users.isAdmin(me);
    const qp = createQuizPath(false);
    qp.init(dir, true, false, []);

    switch (operation) {
      case "copy":
      case "move":
        if (operation === "move") qp.checkDeleteFiles(files, me.id ?? 0, isadmin);
        await setFmSession({ files, operation, fromDir: dir });
        break;
      case "chown": {
        await checkAdmin();
        if (newowner !== "" && /^\d+$/.test(newowner)) qp.chownFiles(files, Number(newowner));
        break;
      }
      case "delete":
        qp.deleteFiles(files, me.id ?? 0, isadmin);
        break;
    }
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** insert_files — completa la copia/movimiento pendiente en el destino. */
export async function insertFilesAction(dir: string): Promise<FileManagerResult> {
  try {
    const me = await checkTeacher();
    const isadmin = users.isAdmin(me);
    const fm = await getFmSession();
    if (!fm || fm.files.length === 0) fmError("Missing source information");
    if (!dir) fmError("Missing destination information");

    const qp = createQuizPath(false);
    qp.init(dir, true, false, []);
    const src = createQuizPath(false);
    src.init(fm!.fromDir, true, false, []);

    insertFiles(qp, src, fm!.files, fm!.operation, me.id ?? 0, isadmin);

    await clearFmSession();
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** cancel_copy — cancela la operación pendiente. */
export async function cancelCopyAction(): Promise<FileManagerResult> {
  try {
    await checkTeacher();
    await clearFmSession();
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** rename_file — renombra el fichero (solo owner o admin). */
export async function renameFileAction(dir: string, oldname: string, newname: string): Promise<FileManagerResult> {
  try {
    const me = await checkTeacher();
    const name = newname.trim();
    if (/[/?*;{}"'\\]/.test(name)) fmError("Illegal character in new filename");
    const qp = createQuizPath(false);
    qp.init(dir, true, false, []);
    const owner = qp.getExerciseOwner(`${oldname}.3et`);
    if (owner !== (me.id ?? 0) && !users.isAdmin(me)) fmError("You do not own this file");
    qp.rename(oldname, name);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** edit_visibility — clases que pueden usar el directorio (solo no top). */
export async function editVisibilityAction(dir: string, inclass: number[]): Promise<FileManagerResult> {
  try {
    await checkTeacher();
    const qp = createQuizPath(false);
    qp.init(dir, true, false, []);
    if (qp.isTop()) fmError("You cannot change the visibility of the top folder");
    const oldClasses = getClassesForDir(qp.getRelative());
    updateClassesForDir(qp.getRelative(), oldClasses, inclass);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** update_ownership — sincroniza bol_exerciseowner con el filesystem (admin). */
export async function updateOwnershipAction(): Promise<FileManagerResult> {
  try {
    await checkAdmin();
    const { added, deleted } = fixExerciseowner();
    return { ok: true, data: { added, deleted } };
  } catch (e) {
    return err(e);
  }
}

/** passage_insert — copia la selección de pasajes del origen a los marcados. */
export async function passageInsertAction(input: {
  dir: string;
  files: string[];
  passageSource: string;
}): Promise<FileManagerResult & { status?: "OK" | "error"; error_text?: string }> {
  try {
    const me = await checkTeacher();
    insertPassages(input.dir, input.files, input.passageSource, me.id ?? 0);
    return { status: "OK", ok: true };
  } catch (e) {
    return { status: "error", error_text: e instanceof Error ? e.message : String(e) };
  }
}