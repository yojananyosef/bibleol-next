import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import Database from "better-sqlite3";
import { tmpdir } from "node:os";
import path from "node:path";

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-auth-test-"));
process.env.BIBLEOL_DATA_DIR = TMP;

let db: Database.Database;
let users: typeof import("../src/lib/services/users.ts");
let hashPassword: (pw: string) => string;
let isScryptHash: (s: string) => boolean;
let verifyPassword: (pw: string, stored: string) => boolean;

const now = () => Math.floor(Date.now() / 1000);

before(async () => {
  const { getAppDb } = await import("../src/lib/db/sqlite.ts");
  db = getAppDb();
  const hp = await import("../src/lib/auth/password.ts");
  hashPassword = hp.hashPassword;
  isScryptHash = hp.isScryptHash;
  verifyPassword = hp.verifyPassword;
  users = await import("../src/lib/services/users.ts");
});

after(() => {
  db.close();
});

function seedUser(overrides: Record<string, unknown> = {}): number {
  const u = users.newUser();
  Object.assign(u, {
    first_name: "Test",
    last_name: "User",
    username: `u${(db.prepare("SELECT COUNT(*) n FROM bol_user").get() as { n: number }).n}`,
    email: "t@test.test",
    ...overrides,
  });
  users.setUser(u, "secret");
  return u.id!;
}

test("verifyLogin: ok con scrypt (nuevas), falla con pw incorrecta", () => {
  const id = seedUser();
  const username = (db.prepare("SELECT username FROM bol_user WHERE id=?").get(id) as { username: string }).username;
  const ok = users.verifyLogin(username, "secret");
  assert.ok(ok);
  assert.equal(ok.id, id);
  assert.equal(users.verifyLogin("no-such-user", "x"), null);
  assert.equal(users.verifyLogin(username, "wrong"), null);
});

test("verifyLogin: md5 legacy se migra a scrypt en el acto (lazy rehash)", () => {
  const u = users.newUser();
  u.first_name = "L"; u.last_name = "M"; u.username = "legacy1"; u.email = "l@m.tt";
  u.password = hashPassword("oldpass");
  users.setUser(u);
  const row = db.prepare("SELECT password FROM bol_user WHERE id=?").get(u.id) as { password: string };
  assert.equal(isScryptHash(row.password), false);

  assert.ok(users.verifyLogin("legacy1", "oldpass"));
  const after = db.prepare("SELECT password FROM bol_user WHERE id=?").get(u.id) as { password: string };
  assert.equal(isScryptHash(after.password), true);
  assert.equal(verifyPassword("oldpass", after.password), true);
  assert.equal(verifyPassword("wrong", after.password), false);
  assert.ok(users.verifyLogin("legacy1", "oldpass"));
});

test("setUser: escribe scrypt para contraseñas nuevas", () => {
  const u = users.newUser();
  u.first_name = "A"; u.last_name = "B"; u.username = "hashi"; u.email = "h@t.tt";
  users.setUser(u, "abcde");
  const row = db.prepare("SELECT password FROM bol_user WHERE id=?").get(u.id) as { password: string };
  assert.equal(isScryptHash(row.password), true);
  assert.equal(verifyPassword("abcde", row.password), true);
  users.setUser(u, "fghij");
  const row2 = db.prepare("SELECT password FROM bol_user WHERE id=?").get(u.id) as { password: string };
  assert.equal(isScryptHash(row2.password), true);
  assert.equal(verifyPassword("fghij", row2.password), true);
  assert.equal(verifyPassword("abcde", row2.password), false);
});

test("verifyPassword: md5 legacy sigue válido hasta la migración", () => {
  const md5 = hashPassword("legit");
  assert.equal(verifyPassword("legit", md5), true);
  assert.equal(verifyPassword("wrong", md5), false);
  assert.equal(verifyPassword("x", ""), false);
  assert.equal(verifyPassword("x", "NONE"), false);
});

test("getUserById(-1) crea usuario nuevo con last_login ficticio", () => {
  const u = users.getUserById(-1);
  assert.equal(u.id, null);
  assert.equal(u.last_login, u.created_time - 10);
  assert.throws(() => users.getUserById(999999), /illegal_user_id/);
});

test("getUserByNameOrEmail: por username, por email y ambigüedad", () => {
  seedUser({ username: "byname", email: "one@t.tt" });
  seedUser({ username: "byemail", email: "two@t.tt" });
  seedUser({ username: "other", email: "two@t.tt" });
  const byName = users.getUserByNameOrEmail("byname", "");
  assert.ok(byName && !Array.isArray(byName));
  assert.equal((byName as import("../src/lib/services/users").UserRow).email, "one@t.tt");
  const byEmail = users.getUserByNameOrEmail("", "one@t.tt");
  assert.ok(byEmail && !Array.isArray(byEmail));
  const multi = users.getUserByNameOrEmail("", "two@t.tt");
  assert.ok(Array.isArray(multi));
  assert.equal(multi!.length, 2);
  assert.equal(users.getUserByNameOrEmail("nobody", ""), null);
});

test("reset key: set, recuperación dentro de 48h", () => {
  const id = seedUser();
  const u = users.getUserById(id) as import("../src/lib/services/users").UserRow;
  users.setResetKey(u, "deadbeef");
  assert.equal(users.getUserByResetKey("deadbeef")?.id, id);
  assert.equal(users.getUserByResetKey("badkey"), null);
});

test("código de aceptación: válido 15 min, caduca después", () => {
  const id = seedUser();
  const u = users.getUserById(id) as import("../src/lib/services/users").UserRow;
  const code = users.generateAcceptanceCode(u);
  assert.ok(code);
  assert.equal(users.verifyAcceptCode(u, code, "en", true), true);
  assert.equal(u.accept_policy >= users.CURRENT_POLICY_DATE, true);
  const u2 = users.getUserById(id) as import("../src/lib/services/users").UserRow;
  assert.equal(u2.accept_policy >= users.CURRENT_POLICY_DATE, true);
  const bad = users.dummyUser();
  bad.acc_code = code;
  bad.acc_code_time = now() - users.ACCEPT_CODE_EXPIRY - 1;
  assert.equal(users.verifyAcceptCode(bad, code, "en", false), false);
});

test("roles y política: isLoggedIn/isAdmin/isTeacher/isTranslator", () => {
  const plain = users.getUserById(seedUser()) as import("../src/lib/services/users").UserRow;
  assert.equal(users.isLoggedIn(plain), false); // sin política aceptada
  plain.accept_policy = now();
  assert.equal(users.isLoggedIn(plain), true);
  assert.equal(users.isTeacher(plain), false);
  plain.isteacher = 1;
  assert.equal(users.isTeacher(plain), true);
  assert.equal(users.isAdmin(plain), false);
  plain.isadmin = 1;
  assert.equal(users.isAdmin(plain), true);
  assert.equal(users.isTranslator(plain), true); // admin = translator
  plain.accept_policy = 0;
  assert.equal(users.isLoggedIn(plain), false);
  assert.equal(users.isAdmin(plain), false);
});

test("deleteUser: borra, mueve exerciseowner a 0 y limpia font", () => {
  const id = seedUser();
  db.prepare(
    "INSERT INTO bol_font (user_id, alphabet_id, font_family, text_size, text_italic, text_bold, feature_size, feature_italic, feature_bold, tooltip_size, tooltip_italic, tooltip_bold, input_size, input_italic, input_bold) VALUES (?, 1, 'Test', 14, 0, 0, 14, 0, 0, 14, 0, 0, 14, 0, 0)"
  ).run(id);
  const owner = db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES ('/demo', ?)").run(id);
  users.deleteUser(id);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_user WHERE id=?").get(id) as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_font WHERE user_id=?").get(id) as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT ownerid FROM bol_exerciseowner WHERE id=?").get(owner.lastInsertRowid) as { ownerid: number }).ownerid, 0);
  assert.throws(() => users.deleteUser(999999), /illegal_user_id/);
});

test("expiración: deleteNewInactive y oldInactive con niveles", () => {
  const oldId = seedUser();
  db.prepare("UPDATE bol_user SET last_login=0, created_time=? WHERE id=?").run(now() - 10, oldId);
  assert.equal(users.deleteNewInactive(5).some((u) => u.id === oldId), true);
  const idle = seedUser();
  db.prepare("UPDATE bol_user SET last_login=? WHERE id=?").run(now() - 1000, idle);
  users.oldInactive(1, 100);
  assert.equal((db.prepare("SELECT warning_sent FROM bol_user WHERE id=?").get(idle) as { warning_sent: number }).warning_sent, 1);
  assert.equal(users.oldInactive(0, 500).some((u) => u.id === idle), true);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM bol_user WHERE id=?").get(idle) as { n: number }).n, 0);
});

test("getUsersPart/filterUsers/countUsers/getTeachers", () => {
  const page = users.getUsersPart(5, 0, "username", "asc");
  assert.equal(page.length <= 5, true);
  const filtered = users.filterUsers({ username: "byname" });
  assert.equal(filtered.length, 1);
  assert.ok(users.countUsers() > 0);
  db.prepare("UPDATE bol_user SET isteacher=1 WHERE username='byname'").run();
  const teachers = users.getTeachers();
  assert.ok(teachers.some((t) => t.username === "byname"));
});

test("generateAdministrator/generateStudent idempotentes", () => {
  const id = users.generateAdministrator("cliadmin", "CLI", "Admin", "pw123");
  assert.equal(users.generateAdministrator("cliadmin", "CLI", "Admin", "pw123"), id);
  const s = users.generateStudent("clistudent", "CLI", "Student", "pw123");
  assert.equal((db.prepare("SELECT isadmin FROM bol_user WHERE id=?").get(s) as { isadmin: number }).isadmin, 0);
});
