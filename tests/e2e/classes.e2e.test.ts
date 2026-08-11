import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import Database from "better-sqlite3";

/**
 * E2E de clases (FASE 6): crear clase (con password), asignar usuarios,
 * enroll del alumno (password correcto/incorrecto), grant/unenroll, y
 * borrado por el profesor. Corre sobre el build de producción
 * (`next start -p 3999`); requiere `npm run build` previo:
 *
 *   npm run test:e2e
 */

const BASE = "http://localhost:3999";
const PORT = 3999;
let server: ChildProcess | null = null;
let browser: Browser;

const name = `e2e_cls_${Date.now()}`;
const createdClassIds: number[] = [];

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.ok) return;
    } catch {
      // aún arrancando
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}

async function login(page: Page, username: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.fill("#login_name", username);
  await page.fill("#password", username);
  await Promise.all([page.waitForURL(`${BASE}/`), page.getByRole("button").first().click()]);
}

before(async () => {
  if (!existsSync(".next/BUILD_ID")) throw new Error("run `npm run build` first");
  await new Promise<void>((res) => {
    server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore" });
    server.once("spawn", res);
  });
  await waitForServer();
  browser = await chromium.launch();
});

after(() => {
  const db = new Database(path.join(process.cwd(), "data", "app.db"));
  const inClause = createdClassIds.map(() => "?").join(",");
  if (createdClassIds.length) {
    db.prepare(`DELETE FROM bol_userclass WHERE classid IN (${inClause})`).run(...createdClassIds);
    db.prepare(`DELETE FROM bol_class WHERE id IN (${inClause})`).run(...createdClassIds);
  }
  db.close();
  browser.close();
  server?.kill();
});

/** El profesor crea una clase con password y la ve en /classes. */
test("teacher creates class with password", async () => {
  const page = await browser.newPage();
  await login(page, "teacher");

  await page.goto(`${BASE}/classes`);
  await page.getByRole("link", { name: "Add class" }).click();
  await page.waitForURL(`${BASE}/classes/-1`);
  await page.fill("#classname", name);
  await page.fill("#password", "s3cret");
  await Promise.all([page.waitForURL(`${BASE}/classes`), page.getByRole("button", { name: "OK" }).click()]);

  const row = page.locator("tbody tr", { hasText: name });
  await row.waitFor();
  assert.match(await row.innerText(), /s3cret/);
  await page.close();
});

/** El alumno no accede a /classes (como otros guardas, lanza error 500). */
test("student is rejected from /classes", async () => {
  const page = await browser.newPage();
  await login(page, "student");
  const resp = await page.goto(`${BASE}/classes`);
  assert.equal(resp?.status(), 500);
  await page.close();
});

/** Enroll del alumno: password incorrecto falla, correcto funciona. */
test("student enrolls with wrong then right password", async () => {
  const page = await browser.newPage();
  await login(page, "student");

  await page.goto(`${BASE}/enroll`);
  const row = page.locator("ul li", { hasText: name });
  await row.waitFor();
  await row.getByRole("button", { name: "Enroll (password)" }).click();

  await page.getByPlaceholder("Password").fill("wrong");
  await page.getByRole("button", { name: "Enroll", exact: true }).last().click();
  await page.locator("p.text-destructive").waitFor();

  await page.getByPlaceholder("Password").fill("s3cret");
  await page.getByRole("button", { name: "Enroll", exact: true }).last().click();
  await page.getByText(`You are now enrolled in the class`).waitFor();
  await page.getByRole("button", { name: "OK" }).click();

  await page.getByText("You are enrolled in").waitFor();
  await page.getByText(name, { exact: true }).first().waitFor();
  await page.close();
});

/** El profesor asigna el alumno como usuario de la clase (se ve marcado). */
test("teacher assigns student to class", async () => {
  const db = new Database(path.join(process.cwd(), "data", "app.db"));
  const classId = (db.prepare("SELECT id FROM bol_class WHERE classname = ?").get(name) as { id?: number })?.id;
  assert.ok(classId, "class row should exist");
  db.close();
  createdClassIds.push(classId);

  const page = await browser.newPage();
  await login(page, "teacher");
  await page.goto(`${BASE}/classes/${classId}/users`);
  await page.locator("div.flex.items-center", { hasText: "Student Demo" }).locator("input[type='checkbox']").check();
  await Promise.all([page.waitForURL(`${BASE}/classes`), page.getByRole("button", { name: "OK" }).click()]);

  await page.goto(`${BASE}/classes/${classId}/users`);
  await page.waitForTimeout(600);
  assert.equal(
    await page.locator("div.flex.items-center", { hasText: "Student Demo" }).locator("input[type='checkbox']").isChecked(),
    true,
  );
  await page.close();
});

/** El alumno concede acceso al profesor y luego se desmatricula. */
test("student grants access and unenrolls", async () => {
  const page = await browser.newPage();
  await login(page, "student");
  await page.goto(`${BASE}/enroll`);
  const row = page.locator("ul li", { hasText: name });
  await row.waitFor();

  await row.getByText("Grant access").click();
  await page.waitForTimeout(400);
  await page.getByText("Teacher can access").first().waitFor();

  await row.getByText("Unenroll").click();
  const enrolledCard = page.locator("div.space-y-6 > div").filter({ hasText: "You are enrolled in" });
  await enrolledCard.locator("li", { hasText: name }).waitFor({ state: "detached" });
  await page.locator("ul li", { hasText: name }).getByRole("button", { name: "Enroll (password)" }).waitFor();
  await page.close();
});

/** El profesor borra la clase; desaparece de /classes y de /enroll. */
test("teacher deletes class", async () => {
  const page = await browser.newPage();
  await login(page, "teacher");
  await page.goto(`${BASE}/classes`);
  const row = page.locator("tbody tr", { hasText: name });
  await row.waitFor();
  await row.getByText("Delete").click();
  await page.getByText("This cannot be undone.").waitFor();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("tbody tr", { hasText: name }).count(), 0);
  await page.close();

  const student = await browser.newPage();
  await login(student, "student");
  await student.goto(`${BASE}/enroll`);
  await student.getByText("No classes available for enrollment.").waitFor();
  await student.close();
});