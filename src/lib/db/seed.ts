import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { QUIZZES_DIR } from "./sqlite.ts";
import { getConfig, hashPassword } from "../config.ts";

const LEGACY_QUIZ_TEMPLATES = "/home/j/dev/BibleOL/quiz_templates";

/** Hash de contraseña idéntico al legacy PHP: md5(pw_salt + password). */
export { hashPassword };

export function md5Hex(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

/** Datos demo: admin/teacher/student, clase Demo Class, enrollments, userconfig. */
export function seedDemoData(db: Database.Database): { users: number; classes: number } {
  const cfg = getConfig();
  const existing = db.prepare("SELECT COUNT(*) AS n FROM bol_user").get() as { n: number };
  if (existing.n > 0) return { users: existing.n, classes: (db.prepare("SELECT COUNT(*) AS n FROM bol_class").get() as { n: number }).n };

  const now = Math.floor(Date.now() / 1000);
  const users = [
    { username: "admin", first_name: "Admin", last_name: "Demo", isadmin: 1, isteacher: 1, istranslator: 1, preflang: "en" },
    { username: "teacher", first_name: "Teacher", last_name: "Demo", isadmin: 0, isteacher: 1, istranslator: 0, preflang: "en" },
    { username: "student", first_name: "Student", last_name: "Demo", isadmin: 0, isteacher: 0, istranslator: 0, preflang: "en" },
  ];

  const insUser = db.prepare(
    `INSERT INTO bol_user (first_name, last_name, username, password, reset, reset_time, isadmin, email, oauth2_login,
      created_time, last_login, warning_sent, isteacher, preflang, family_name_first, istranslator, accept_policy,
      policy_lang, acc_code, acc_code_time, prefvariant)
     VALUES (@first_name, @last_name, @username, @password, NULL, 0, @isadmin, @email, NULL, @created_time, 0, 0,
      @isteacher, @preflang, 0, @istranslator, 0, NULL, NULL, 0, NULL)`
  );

  const tx = db.transaction(() => {
    for (const u of users) {
      insUser.run({
        ...u,
        password: hashPassword(cfg.pw_salt, u.username),
        email: `${u.username}@bibleol.test`,
        created_time: now,
      });
    }
    const getId = db.prepare("SELECT id FROM bol_user WHERE username=?");
    const ids = new Map(users.map((u) => [u.username, (getId.get(u.username) as { id: number }).id]));
    db.prepare("INSERT INTO bol_userconfig (user_id, usetooltip) VALUES (?, 1)").run(ids.get("student")!);
    const classId = db
      .prepare("INSERT INTO bol_class (classname, password, enrol_before, ownerid, priority) VALUES (?, NULL, NULL, ?, 0)")
      .run("Demo Class", ids.get("teacher")!)
      .lastInsertRowid;
    for (const u of ["teacher", "student"]) {
      db.prepare("INSERT INTO bol_userclass (userid, classid, access) VALUES (?, ?, 1)").run(ids.get(u)!, classId);
    }
  });
  tx();
  return { users: users.length, classes: 1 };
}

/** Copia quiz_templates del repo legacy a data/quizzes (ejercicios .3et). */
export function seedQuizTemplates(): boolean {
  if (existsSync(QUIZZES_DIR) && readdirSync(QUIZZES_DIR).length > 0) return false;
  if (!existsSync(LEGACY_QUIZ_TEMPLATES)) return false;
  mkdirSync(path.dirname(QUIZZES_DIR), { recursive: true });
  cpSync(LEGACY_QUIZ_TEMPLATES, QUIZZES_DIR, { recursive: true });
  return true;
}
