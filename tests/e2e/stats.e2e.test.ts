import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import Database from "better-sqlite3";

/**
 * E2E de estadísticas/notas (FASE 8): un quiz terminado del exercicio
 * demo1 (estudiante) se muestra en /stats, /stats/time y /stats/exercises;
 * el profesor ve las notas en /grades → /grades/class/.../exercises.
 * Requiere `npm run build` previo.
 */

const BASE = "http://localhost:3999";
const PORT = 3999;
let server: ChildProcess | null = null;
let browser: Browser;

const DB_PATH = path.join(process.cwd(), "data", "app.db");
const STUDENT_ID = 3; // estudiante de Demo Class
let quizId: number | null = null;
let questionId: number | null = null;
let insertedExerciseDir: boolean = false;

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

/** Prepara un quiz terminado del estudiante en ETCBC4/demo/demo1.3et. */
function prepareQuiz(db: Database.Database): void {
  const templ = db.prepare("SELECT id FROM bol_sta_quiztemplate WHERE userid = ? AND pathname = 'ETCBC4/demo/demo1.3et'").get(STUDENT_ID) as { id: number } | undefined;
  assert.ok(templ, "template demo1 del estudiante");
  const now = Math.floor(Date.now() / 1000);
  quizId = Number(
    (db.prepare("SELECT id FROM bol_sta_quiz WHERE templid = ? AND userid = ?").get(templ.id, STUDENT_ID) as { id?: number } | undefined)?.id ?? 0,
  );
  if (!quizId) {
    quizId = Number(
      db.prepare("INSERT INTO bol_sta_quiz (userid, templid, start, end, valid, grading, tot_questions) VALUES (?, ?, ?, ?, 1, 1, 2)").run(STUDENT_ID, templ.id, now - 3600, now).lastInsertRowid,
    );
  } else {
    db.prepare("UPDATE bol_sta_quiz SET start = ?, end = ?, valid = 1, grading = 1, tot_questions = 2 WHERE id = ?").run(now - 3600, now, quizId);
  }
  questionId = Number(
    (db.prepare("SELECT id FROM bol_sta_question WHERE quizid = ?").get(quizId) as { id?: number } | undefined)?.id ?? 0,
  );
  if (!questionId) {
    questionId = Number(
      db.prepare("INSERT INTO bol_sta_question (userid, quizid, txt, location, time) VALUES (?, ?, 'word1', 'Genesis 1:1', ?)").run(STUDENT_ID, quizId, now - 3590).lastInsertRowid,
    );
  }
  db.prepare("DELETE FROM bol_sta_requestfeature WHERE questid = ?").run(questionId);
  db.prepare("INSERT INTO bol_sta_requestfeature (userid, questid, qono, name, value, answer, correct) VALUES (?, ?, 1, 'gn', 'm', 'm', 1)").run(STUDENT_ID, questionId);
  db.prepare("INSERT INTO bol_sta_requestfeature (userid, questid, qono, name, value, answer, correct) VALUES (?, ?, 1, 'nu', 'sg', 'pl', 0)").run(STUDENT_ID, questionId);

  // Asegura que la clase 1 tiene asignado el directorio ETCBC4/demo (pathid 2)
  const has = db.prepare("SELECT id FROM bol_classexercise WHERE classid = 1 AND pathid = 2").get();
  if (!has) {
    insertedExerciseDir = true;
    db.prepare("INSERT INTO bol_classexercise (classid, pathid) VALUES (1, 2)").run();
  }
}

function cleanup(db: Database.Database): void {
  if (quizId) db.prepare("DELETE FROM bol_sta_universe WHERE quizid = ?").run(quizId);
  if (questionId) {
    db.prepare("DELETE FROM bol_sta_displayfeature WHERE questid = ?").run(questionId);
    db.prepare("DELETE FROM bol_sta_requestfeature WHERE questid = ?").run(questionId);
    db.prepare("DELETE FROM bol_sta_question WHERE id = ?").run(questionId);
  }
  if (quizId) db.prepare("UPDATE bol_sta_quiz SET end = NULL, grading = NULL, valid = 1, tot_questions = 0 WHERE id = ?").run(quizId);
  if (insertedExerciseDir) db.prepare("DELETE FROM bol_classexercise WHERE classid = 1 AND pathid = 2").run();
}

before(async () => {
  if (!existsSync(".next/BUILD_ID")) throw new Error("run `npm run build` first");
  const db = new Database(DB_PATH);
  prepareQuiz(db);
  db.close();
  await new Promise<void>((res) => {
    server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore" });
    server.once("spawn", res);
  });
  await waitForServer();
  browser = await chromium.launch();
});

after(() => {
  const db = new Database(DB_PATH);
  cleanup(db);
  db.close();
  browser.close();
  server?.kill();
});

test("estudiante: /stats muestra las tablas de su ejercicio", async () => {
  const page = await browser.newPage();
  await login(page, "student");
  await page.goto(`${BASE}/stats`);
  await page.waitForSelector("main");
  const text = await page.locator("main").innerText();
  assert.ok(text.includes("My statistics"));
  assert.ok(text.includes("demo1.3et"), "el ejercicio demo1 debe listarse");
  assert.ok(text.includes("Correct answer"), "tabla de features presente");
  await page.close();
});

test("estudiante: /stats/exercises muestra gráfica de % correcto", async () => {
  const page = await browser.newPage();
  await login(page, "student");
  await page.goto(`${BASE}/stats/exercises?templ=ETCBC4%2Fdemo%2Fdemo1`);
  await page.waitForSelector("main");
  const text = await page.locator("main").innerText();
  assert.ok(text.includes("Exercise statistics"));
  assert.ok(text.includes("Highest percentage correct by date"));
  await page.close();
});

test("estudiante: /stats/time muestra horas por semana", async () => {
  const page = await browser.newPage();
  await login(page, "student");
  await page.goto(`${BASE}/stats/time`);
  await page.waitForSelector("main");
  const text = await page.locator("main").innerText();
  assert.ok(text.includes("My time statistics"));
  assert.ok(text.includes("Hours per week"));
  await page.close();
});

test("profesor: /grades y notas por ejercicio con detalle", async () => {
  const page = await browser.newPage();
  await login(page, "teacher");
  await page.goto(`${BASE}/grades`);
  await page.waitForSelector("main");
  const g = await page.locator("main").innerText();
  assert.ok(g.includes("Demo Class"));

  await page.goto(`${BASE}/grades/class/1/exercises?exercise=ETCBC4%2Fdemo%2Fdemo1&grade_system=percent&max_time=3600`);
  await page.waitForSelector("main");
  const text = await page.locator("main").innerText();
  assert.ok(text.includes("Statistics for class: Demo Class"));
  assert.ok(text.includes("Student Demo"), "fila del estudiante en la tabla de notas");
  assert.ok(text.includes("50%"), "nota percent correcta (1 acierto de 2)");
  assert.ok(text.includes("CSV"), "botón de export CSV");
  await page.close();
});
