"use server";

import { redirect } from "next/navigation";
import { MIN_PW_LENGTH, generateHexKey, generatePw } from "@/lib/auth/password";
import { setSession, clearSession, getSession } from "@/lib/auth/session";
import * as users from "@/lib/services/users";
import { currentUser, currentUserOrDummy } from "@/lib/auth/guards";
import { sendMail } from "@/lib/mail";

export type ActionResult = { error?: string; ok?: true; noEmail?: true; sent?: true; linkBad?: true };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALPHA_NUMERIC_RE = /^[a-zA-Z0-9]+$/;

function clean(s: FormDataEntryValue | null): string {
  return typeof s === "string" ? s.trim() : "";
}

/** Actualiza la sesión (ol_user/language/variant) — set_login_session del PHP. */
async function applyLoginSession(u: users.UserRow): Promise<void> {
  await setSession({
    userId: u.id!,
    language: u.preflang && u.preflang !== "none" ? u.preflang : "en",
    variant: u.prefvariant && u.prefvariant !== "none" ? (u.prefvariant === "main" ? "" : u.prefvariant) : "",
  });
}

// ---- Ctrl_login::index + password_check ----

export async function loginAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const loginName = clean(formData.get("login_name"));
  const password = formData.get("password")?.toString() ?? "";
  if (!loginName || !password) return { error: "bad_password" };

  const u = users.verifyLogin(loginName, password);
  if (!u) {
    await clearSession();
    return { error: "bad_password" };
  }
  await applyLoginSession(u);
  if (users.acceptedCurrentPolicy(u)) {
    users.updateLoginStat(u);
    if (users.noName(u)) redirect("/profile");
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

// ---- Ctrl_login::accept_policy_yes / no ----

export async function acceptPolicyYesAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  const me = session ? users.getUserById(session.userId) : users.dummyUser();
  const acceptanceCode = clean(formData.get("acceptance_code"));
  const policyLang = clean(formData.get("policy_lang"));
  if ((me.id ?? 0) <= 0) return { error: "must_be_logged_in" };
  if (users.verifyAcceptCode(me, acceptanceCode, policyLang, true)) {
    users.updateLoginStat(me);
    await applyLoginSession(me);
  } else {
    await clearSession();
    return { error: "must_be_logged_in" };
  }
  if (users.noName(me)) redirect("/profile");
  redirect("/");
}

export async function acceptPolicyNoAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

// ---- Ctrl_users::sign_up ----

export async function signUpAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await currentUserOrDummy();
  if (users.isLoggedIn(me)) return { error: "already_logged_in" };

  const username = clean(formData.get("username"));
  const email = clean(formData.get("email"));
  const preflang = clean(formData.get("preflang"));
  const prefvariant = clean(formData.get("prefvariant"));

  if (!username) return { error: "user_name_required" };
  if (username.length > 20) return { error: "user_name_too_long" };
  if (!ALPHA_NUMERIC_RE.test(username)) return { error: "user_name_illegal" };
  if (!email || !EMAIL_RE.test(email)) return { error: "email_invalid" };
  if (users.getUserByNameOrEmail(username, "")) return { error: "user_name_used" };

  const u = users.newUser();
  u.isadmin = 0;
  u.isteacher = 0;
  u.istranslator = 0;
  u.email = email;
  u.username = username;
  u.created_time = Math.floor(Date.now() / 1000);
  u.last_login = 0;
  u.warning_sent = 0;
  u.preflang = preflang || "none";
  u.prefvariant = prefvariant || "";

  const pw = generatePw();
  users.setUser(u, pw);

  await sendMail(
    email,
    "Account created",
    `Your account at Bible Online Learner has been created.\n\nUsername: ${username}\nPassword: ${pw}\n\nLog in at ${origin()}/login`
  );
  return { ok: true };
}

// ---- Ctrl_users::forgot_pw ----

export async function forgotPwAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const username = clean(formData.get("username"));
  const email = clean(formData.get("email"));
  if (!username && !email) return { error: "specify_name" };
  if (!EMAIL_RE.test(email)) return { error: "email_invalid" };

  const found = users.getUserByNameOrEmail(username, email);
  if (found === null) return { error: "user_not_found" };
  if (Array.isArray(found)) return { error: `several_accounts: ${found.map((f) => f.username).join(" ")}` };
  if (!found.email) return { noEmail: true };

  const resetKey = generateHexKey();
  users.setResetKey(found, resetKey);
  await sendMail(
    found.email,
    "Forgotten password",
    `Hello ${users.makeFullName(found)},\n\nYour username is: ${found.username}\n\nReset your password at:\n${origin()}/reset/${resetKey}`
  );
  return { sent: true };
}

// ---- Ctrl_users::reset (one-click: genera nueva contraseña y la envía) ----

export async function resetAction(resetKey: string): Promise<ActionResult> {
  const u = users.getUserByResetKey(resetKey);
  if (!u) return { linkBad: true };
  if (!u.email) return { noEmail: true };

  u.reset = null;
  u.reset_time = 0;
  const pw = generatePw();
  users.setUser(u, pw);

  await sendMail(
    u.email,
    "Password reset",
    `Hello ${users.makeFullName(u)},\n\nYour new password is: ${pw}\n\nUsername: ${u.username}`
  );
  return { sent: true };
}

// ---- Ctrl_users::profile ----

export async function editProfileAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (me.oauth2_login) return { error: `must_not_be_${me.oauth2_login}` };

  const first = clean(formData.get("first_name"));
  const last = clean(formData.get("last_name"));
  const email = clean(formData.get("email"));
  const pw1 = formData.get("password1")?.toString() ?? "";
  const pw2 = formData.get("password2")?.toString() ?? "";

  if (!first) return { error: "first_name_required" };
  if (!last) return { error: "last_name_required" };
  if (email && !EMAIL_RE.test(email)) return { error: "email_invalid" };
  if (pw1 !== pw2) return { error: "passwords_differ" };
  if (pw1 && pw1.length < MIN_PW_LENGTH) return { error: "pw_min_length" };

  me.first_name = first;
  me.last_name = last;
  me.family_name_first = formData.get("family_name_first") === "yes" || formData.get("family_name_first") === "on" ? 1 : 0;
  me.email = email;
  me.preflang = clean(formData.get("preflang")) || "none";
  me.prefvariant = clean(formData.get("prefvariant")) || "";
  users.setUser(me, pw1 || undefined);
  await applyLoginSession(me);
  redirect("/");
}

export async function deleteMeAction(): Promise<ActionResult> {
  const me = await currentUser();
  if (!users.isLoggedIn(me)) return { error: "must_be_logged_in" };
  if (me.oauth2_login) return { error: `must_not_be_${me.oauth2_login}` };
  users.deleteUser(me.id!);
  await clearSession();
  redirect("/login");
}

// ---- Ctrl_users::users / filter_users / edit_one_user / delete_user ----

export async function adminSaveUserAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!users.isTeacher(me)) return { error: "must_be_teacher" };

  const userid = parseInt(formData.get("userid")?.toString() ?? "0", 10);
  const extras = userListExtras(formData);

  const u = userid === -1 ? users.newUser() : users.getUserById(userid);

  if (u.oauth2_login) {
    if (users.isAdmin(me)) u.isadmin = formData.get("isadmin") === "yes" || formData.get("isadmin") === "on" ? 1 : 0;
    if (users.isTeacher(me)) u.isteacher = formData.get("isteacher") === "yes" || formData.get("isteacher") === "on" ? 1 : 0;
    if (users.isTranslator(me)) u.istranslator = formData.get("istranslator") === "yes" || formData.get("istranslator") === "on" ? 1 : 0;
    u.preflang = clean(formData.get("preflang")) || "none";
    u.prefvariant = clean(formData.get("prefvariant")) || "";
    users.setUser(u);
    redirect(`/admin/users${extras}`);
  }

  const first = clean(formData.get("first_name"));
  const last = clean(formData.get("last_name"));
  const email = clean(formData.get("email"));
  const pw1 = formData.get("password1")?.toString() ?? "";
  const pw2 = formData.get("password2")?.toString() ?? "";

  if (!first) return { error: "first_name_required" };
  if (!last) return { error: "last_name_required" };
  if (email && !EMAIL_RE.test(email)) return { error: "email_invalid" };
  if (pw1 !== pw2) return { error: "passwords_differ" };

  if (userid === -1) {
    const username = clean(formData.get("username"));
    if (!username) return { error: "user_name_required" };
    if (username.length > 20) return { error: "user_name_too_long" };
    if (!ALPHA_NUMERIC_RE.test(username)) return { error: "user_name_illegal" };
    if (users.getUserByNameOrEmail(username, "")) return { error: "user_name_used" };
    if (pw1.length < MIN_PW_LENGTH) return { error: "pw_min_length" };
    u.username = username;
  }

  u.first_name = first;
  u.last_name = last;
  u.family_name_first = formData.get("family_name_first") === "yes" || formData.get("family_name_first") === "on" ? 1 : 0;
  if (users.isAdmin(me)) u.isadmin = formData.get("isadmin") === "yes" || formData.get("isadmin") === "on" ? 1 : 0;
  if (users.isTeacher(me)) u.isteacher = formData.get("isteacher") === "yes" || formData.get("isteacher") === "on" ? 1 : 0;
  if (users.isTranslator(me)) u.istranslator = formData.get("istranslator") === "yes" || formData.get("istranslator") === "on" ? 1 : 0;
  u.email = email;
  u.preflang = clean(formData.get("preflang")) || "none";
  u.prefvariant = clean(formData.get("prefvariant")) || "";

  const isNew = userid === -1;
  users.setUser(u, pw1 || undefined);

  if (isNew && u.email) {
    await sendMail(
      u.email,
      "Account created",
      `Hello ${users.makeFullName(u)},\n\nUsername: ${u.username}\nPassword: ${pw1}\n\nLog in at ${origin()}/login`
    );
  }
  redirect(`/admin/users${extras}`);
}

export async function adminDeleteUserAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!users.isTeacher(me)) return { error: "must_be_teacher" };
  const userid = parseInt(formData.get("userid")?.toString() ?? "0", 10);
  const extras = userListExtras(formData);
  if (userid <= 0) return { error: "illegal_user_id" };
  if (me.id === userid) return { error: "cannot_delete_self" };
  const target = users.getUserById(userid);
  if (!users.isAdmin(me) && (target.isadmin || target.isteacher)) return { error: "only_admin_delete" };
  users.deleteUser(userid);
  redirect(`/admin/users${extras}`);
}

/** Devuelve el suffijo ?offset=..&orderby=..&(asc|desc) del formulario. */
function userListExtras(formData: FormData): string {
  const offset = clean(formData.get("offset"));
  const orderby = clean(formData.get("orderby")) || "username";
  const desc = formData.get("sortorder") === "desc";
  const o = offset && offset !== "0" ? `offset=${offset}` : "";
  const q = [o, `orderby=${orderby}`, desc ? "desc" : "asc"].filter(Boolean).join("&");
  return q ? `?${q}` : "";
}

function origin(): string {
  return process.env.BIBLEOL_BASE_URL ?? "http://localhost:3000";
}
