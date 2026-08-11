"use server";

// Acciones de FASE 6 — clases y matrícula (port de Ctrl_classes + Ctrl_userclass).
// Cada acción replica las guardas del legacy (check_teacher / check_logged_in /
// owner/admin) y devuelve { ok } | { error }.

import { checkAdmin, checkLoggedIn, checkTeacher } from "@/lib/auth/guards";
import * as cls from "@/lib/services/classes";
import * as uc from "@/lib/services/userclass";
import * as users from "@/lib/services/users";
import { isAdmin, makeFullName, type UserRow } from "@/lib/services/users";

export type ClsResult = { ok?: true; error?: string; data?: unknown };

function err(e: unknown): ClsResult {
  return { error: e instanceof Error ? e.message : String(e) };
}

/** Datos de la lista de clases (Ctrl_classes::classes). */
export async function getClassesListAction(): Promise<ClsResult> {
  try {
    const me = await checkTeacher();
    const teachers = isAdmin(me) ? users.getTeachers() : [];
    const allclasses = cls.getAllClasses();
    allclasses.sort((a, b) => (a.classname < b.classname ? -1 : a.classname > b.classname ? 1 : 0));
    return {
      ok: true,
      data: {
        allclasses: allclasses.map((c) => ({
          ...c,
          owner_name:
            c.ownerid === 0 ? "no_owner" : makeFullName({ first_name: c.ufirst_name ?? "", last_name: c.ulast_name ?? "", family_name_first: 0 }),
        })),
        teachers: teachers.map((t) => ({ id: t.id, name: makeFullName(t) })),
        myid: me.id,
        isadmin: isAdmin(me),
      },
    };
  } catch (e) {
    return err(e);
  }
}

/** get_class_by_id (con clase nueva si id=-1) para el formulario de edición. */
export async function getClassEditAction(classid: number): Promise<ClsResult> {
  try {
    const me = await checkTeacher();
    const info = cls.getClassById(classid, me);
    if (classid !== -1 && info.ownerid !== (me.id ?? 0) && !isAdmin(me))
      return { error: cls.MSG_CLASSES.notClassOwner };
    return { ok: true, data: info };
  } catch (e) {
    return err(e);
  }
}

/**
 * save_class (Ctrl_classes::edit_one_class): valida nombre (requerido, único
 * si es nuevo o modificado), password y enrol_before (fecha válida).
 */
export async function saveClassAction(
  form: FormData,
): Promise<ClsResult> {
  try {
    const me = await checkTeacher();
    const classid = Number(form.get("classid") ?? "-1");
    const classname = String(form.get("classname") ?? "").trim().replace(/<[^>]*>/g, "");
    const password = String(form.get("password") ?? "");
    const enrol_before = String(form.get("enrol_before") ?? "").trim();

    if (classname === "") return { error: "class_name_required" };
    const info = cls.getClassById(classid, me);
    if (info.id !== -1 && info.ownerid !== (me.id ?? 0) && !isAdmin(me))
      return { error: cls.MSG_CLASSES.notClassOwner };
    if (enrol_before !== "" && !cls.dateValidCheck(enrol_before))
      return { error: "date_invalid" };
    if (classid === -1 || classname !== info.classname) {
      if (cls.classNameExists(classname)) return { error: "class_name_used" };
    }

    cls.setClass({
      id: info.id === -1 ? null : info.id,
      classname,
      password,
      enrol_before,
      ownerid: info.ownerid,
      priority: info.priority,
    });
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** delete_class (Ctrl_classes::delete_class): solo owner o admin. */
export async function deleteClassAction(form: FormData): Promise<ClsResult> {
  try {
    const me = await checkTeacher();
    const classid = Number(form.get("classid") ?? 0);
    if (classid <= 0) return { error: cls.MSG_CLASSES.illegalClassId };
    const info = cls.getClassById(classid, me);
    if (info.ownerid !== (me.id ?? 0) && !isAdmin(me)) return { error: cls.MSG_CLASSES.notClassOwner };
    cls.deleteClass(classid);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** change_owner (Ctrl_classes::change_owner): solo admin. */
export async function changeOwnerAction(form: FormData): Promise<ClsResult> {
  try {
    await checkAdmin();
    const classid = Number(form.get("classid") ?? 0);
    const newowner = Number(form.get("newowner") ?? 0);
    if (classid <= 0) return { error: cls.MSG_CLASSES.illegalClassId };
    if (newowner <= 0) return { error: uc.MSG_USERCLASS.illegalUserId };
    cls.chownClass(classid, newowner);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** add_one_grader: busca por username y añade a bol_grader (solo admin, como la UI legacy). */
export async function addGraderAction(form: FormData): Promise<ClsResult> {
  try {
    await checkAdmin();
    const classid = Number(form.get("classid") ?? 0);
    const username = String(form.get("grader_username") ?? "").trim();
    if (classid <= 0) return { error: cls.MSG_CLASSES.illegalClassId };
    const user = users.getUserByNameOrEmail(username, "");
    if (!user || Array.isArray(user)) return { error: "no_user_found" };
    cls.addGrader(classid, user.id ?? 0);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** Datos de la página users_in_class. */
export async function getUsersInClassAction(form: FormData): Promise<ClsResult> {
  try {
    const me = await checkTeacher();
    const classid = Number(form.get("classid") ?? 0);
    const data = uc.usersInClass(classid, me);
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

/** update_users_in_class (Ctrl_userclass::users_in_class POST). */
export async function updateUsersInClassAction(form: FormData): Promise<ClsResult> {
  try {
    const me = await checkTeacher();
    const classid = Number(form.get("classid") ?? 0);
    uc.usersInClass(classid, me); // guardas: clase existe + owner/admin
    const newUsers = form.getAll("inclass").map(Number);
    uc.updateUsersInClass(classid, uc.getUsersInClass(classid), newUsers);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** Datos de la página de matrícula (Ctrl_userclass::enroll). */
export async function getEnrollDataAction(): Promise<ClsResult> {
  try {
    const me = await checkLoggedIn();
    return { ok: true, data: uc.enrollAvailability(me) };
  } catch (e) {
    return err(e);
  }
}

/** enroll_in (Ctrl_userclass::enroll_in): matricula con password de clase. */
export async function enrollInAction(form: FormData): Promise<ClsResult> {
  try {
    const me = await checkLoggedIn();
    const classid = Number(form.get("classid") ?? 0);
    const password = String(form.get("password") ?? "");
    const c = uc.enrollIn((me as UserRow).id ?? 0, classid, password === "" ? null : password);
    return { ok: true, data: { classname: c.classname } };
  } catch (e) {
    return err(e);
  }
}

/** manage_access (Ctrl_userclass::manage_access). */
export async function manageAccessAction(form: FormData): Promise<ClsResult> {
  try {
    const me = await checkLoggedIn();
    const classid = Number(form.get("classid") ?? 0);
    const grant = Number(form.get("grant") ?? 0);
    uc.manageAccess((me as UserRow).id ?? 0, classid, grant);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

/** unenroll_from (Ctrl_userclass::unenroll_from). */
export async function unenrollAction(form: FormData): Promise<ClsResult> {
  try {
    const me = await checkLoggedIn();
    const classid = Number(form.get("classid") ?? 0);
    uc.unenrollFrom((me as UserRow).id ?? 0, classid);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}