import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import Database from "better-sqlite3";

/**
 * E2E de exámenes (FASE 7): el profesor crea un examen con dos ejercicios,
 * programa una instancia activa, y el alumno lo toma por completo
 * (encadenado exercise_lst → bol_exam_results / bol_exam_finished → done).
 * Requiere `npm run build` previo.
 */

const BASE = "http://localhost:3999";
const PORT = 3999;
let server: ChildProcess | null = null;
let browser: Browser;

const DB_PATH = path.join(process.cwd(), "data", "app.db");

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
  await Promise.all([page.waitForURL(`${BASE}/`), page.getByRole("button", { name: "Log in" }).click()]);
}

/** Contesta todas las preguntas de un ejercicio (selects de gender/número o input de texto). */
async function answerAll(page: Page): Promise<void> {
  const progress = (await page.locator("main").innerText()).match(/\d+\/(\d+)/);
  const count = progress ? Number(progress[1]) : 1;
  for (let qi = 0; qi < count; qi++) {
    const select = page.locator("tbody select").first();
    if (await select.count()) {
      await select.selectOption({ label: "Masculine" });
    } else {
      await page.locator("tbody input").first().fill(`answer ${qi}`);
    }
    await page.getByRole("button", { name: "Check answer", exact: true }).click();
    if (qi < count - 1) await page.getByRole("button", { name: "Next question", exact: true }).click();
  }
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
  const db = new Database(DB_PATH);
  db.prepare("DELETE FROM bol_exam_finished WHERE activeexamid IN (SELECT id FROM bol_exam_active WHERE exam_id IN (SELECT id FROM bol_exam WHERE exam_name LIKE 'e2e_exam_%'))").run();
  db.prepare("DELETE FROM bol_exam_results WHERE activeexamid IN (SELECT id FROM bol_exam_active WHERE exam_id IN (SELECT id FROM bol_exam WHERE exam_name LIKE 'e2e_exam_%'))").run();
  db.prepare("DELETE FROM bol_exam_status WHERE activeexamid IN (SELECT id FROM bol_exam_active WHERE exam_id IN (SELECT id FROM bol_exam WHERE exam_name LIKE 'e2e_exam_%'))").run();
  db.prepare("DELETE FROM bol_exam_active WHERE exam_id IN (SELECT id FROM bol_exam WHERE exam_name LIKE 'e2e_exam_%')").run();
  db.prepare("DELETE FROM bol_exam WHERE exam_name LIKE 'e2e_exam_%'").run();
  db.close();
  browser.close();
  server?.kill();
});

test("profesor: crea examen, lo edita y programa una instancia activa", async () => {
  const page = await browser.newPage();
  await login(page, "teacher");

  // Crear examen con demo1 + demo2 desde el selector.
  await page.goto(`${BASE}/exams/new`);
  await page.fill("#examname", "e2e_exam_flow");
  await page.getByText("ETCBC4/").click();
  await page.getByText("demo/").click();
  const demo1 = page.locator("ul li", { hasText: "demo1.3et" }).locator("input[type='checkbox']");
  await demo1.check();
  await page.locator("ul li", { hasText: "demo2.3et" }).locator("input[type='checkbox']").check();
  await Promise.all([page.waitForURL(`${BASE}/exams`), page.getByRole("button", { name: "Create exam" }).click()]);

  const row = page.locator("tbody tr", { hasText: "e2e_exam_flow" });
  await row.waitFor();

  // Editar: numq del primer ejercicio = 3.
  await row.getByText("Edit").click();
  await page.waitForURL(/\/exams\/\d+\/edit/);
  await page.getByLabel("Exam description").fill("e2e description");
  const numqInputs = page.locator("input[type='number']");
  await numqInputs.first().fill("3");
  await Promise.all([page.waitForURL(`${BASE}/exams`), page.getByRole("button", { name: "Save" }).click()]);

  // Crear instancia: ventana activa (ayer → mañana), 90 minutos, clase Demo.
  await page.locator("tbody tr", { hasText: "e2e_exam_flow" }).getByText("Create instance").click();
  const dl = page.locator("input[type='datetime-local']");
  await dl.first().fill(new Date(Date.now() - 86_400_000).toISOString().slice(0, 16));
  await dl.last().fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "OK" }).click();
  await page.waitForURL(`${BASE}/exams/active`);

  const card = page.locator("div", { hasText: "e2e_exam_flow" }).first();
  await card.waitFor();
  assert.match(await card.innerText(), /Take exam/);
  await page.close();
});

test("alumno: toma el examen completo (encadenado de ejercicios)", async () => {
  const db = new Database(DB_PATH);
  const activeId = (db.prepare("SELECT id FROM bol_exam_active WHERE exam_id IN (SELECT id FROM bol_exam WHERE exam_name='e2e_exam_flow')").get() as { id: number }).id;
  db.close();

  const page = await browser.newPage();
  await login(page, "student");

  await page.goto(`${BASE}/exams/active`);
  const card = page.locator("div", { hasText: "e2e_exam_flow" }).first();
  await card.getByRole("link", { name: "Take exam" }).click();

  // Primer ejercicio (demo1, count=3) → Finish section encadena a demo2.
  await page.waitForURL(/\/quiz\/run\?quiz=ETCBC4%2Fdemo%2Fdemo1\.3et&count=3&examid=/);
  await page.getByRole("button", { name: "Check answer" }).waitFor();
  await answerAll(page);
  await page.getByRole("button", { name: "Finish section", exact: true }).click();

  // Segundo ejercicio (demo2, count=10) → Finish section → /exams/done.
  await page.waitForURL(/\/quiz\/run\?quiz=ETCBC4%2Fdemo%2Fdemo2\.3et&count=10&examid=/);
  await page.getByRole("button", { name: "Check answer" }).waitFor();
  await answerAll(page);
  await page.getByRole("button", { name: "Finish section", exact: true }).click();
  await page.waitForURL(`${BASE}/exams/done`);
  await page.getByRole("heading", { name: "Exam finished" }).waitFor();

  const check = new Database(DB_PATH);
  const results = check.prepare("SELECT quiztemplid FROM bol_exam_results WHERE activeexamid = ?").all(activeId) as Array<{ quiztemplid: number }>;
  assert.equal(results.length, 2, "dos ejercicios registrados en bol_exam_results");
  const templ = check.prepare("SELECT pathname FROM bol_sta_quiztemplate WHERE id = ?").get(results[0].quiztemplid) as { pathname: string };
  assert.match(templ.pathname, /demo1\.3et$/);
  assert.ok(
    check.prepare("SELECT 1 FROM bol_exam_finished WHERE userid = 3 AND activeexamid = ?").get(activeId),
    "bol_exam_finished escrito al completar el examen",
  );
  const status = check.prepare("SELECT start_time, deadline FROM bol_exam_status WHERE userid = 3 AND activeexamid = ?").get(activeId) as { start_time: number; deadline: number };
  assert.ok(status.deadline > status.start_time, "deadline persistido");
  check.close();
  await page.close();
});