import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import Database from "better-sqlite3";

/**
 * E2E del editor de ejercicios (flujo completo de profesor + alumno) sobre el
 * build de producción (`next start -p 3999`). Requiere haber corrido `npm run build`.
 *
 *   npm run test:e2e
 *
 * Cubre: login real, navegador de ejercicios, editor (tabs, selección de
 * feature, guardado con diálogo de nombre, sobrescritura, Test Exercise) y
 * la ejecución del quiz guardado como alumno. Crea/borra su propio .3et.
 */

const BASE = "http://localhost:3999";
const PORT = 3999;
const QUIZZES_ROOT = path.join(process.cwd(), "data", "quizzes");
const QUIZ_DIR = "ETCBC4/demo";
let server: ChildProcess | null = null;
let browser: Browser;

function newName(): string {
  return `e2e_${Date.now()}`;
}

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

/** Navega al directorio ETCBC4/demo del navegador de ejercicios. */
async function openDemoDir(page: Page): Promise<void> {
  await page.goto(`${BASE}/quiz`);
  await page.getByText("Select exercise").waitFor();
  await page.getByRole("button", { name: "ETCBC4/" }).click();
  await page.getByRole("button", { name: "demo/" }).click();
}

/** Espera a que el editor esté cargado (título + tabs). */
async function editorReady(page: Page): Promise<void> {
  await page.getByText("Exercise editor").waitFor();
  await page.getByRole("tab", { name: "Passages" }).waitFor();
  await page.getByRole("tab", { name: "Features" }).waitFor();
  await page.getByRole("tab", { name: "Timer" }).waitFor();
}

before(async () => {
  server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  await waitForServer();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    server = null;
  }
});

test("profesor: crea, sobrescribe y testea un ejercicio", { timeout: 240_000 }, async () => {
  const ctx: BrowserContext = await browser.newContext();
  const page: Page = await ctx.newPage();
  const name = newName();
  const file = `${name}.3et`;
  const filePath = path.join(QUIZZES_ROOT, QUIZ_DIR, file);

  try {
    await login(page, "teacher");

    // Navegador → directorio → New exercise (con la db por defecto)
    await openDemoDir(page);
    await page.getByRole("link", { name: "New exercise" }).click();
    await page.waitForURL(/\/quiz\/editor\?dir=/);
    await editorReady(page);

    // Seleccionar un pasaje (el editor exige al menos uno para guardar)
    await page.getByRole("tab", { name: "Passages" }).click();
    await page.locator("ul li input[type='checkbox']:visible").first().check();

    // Tab de Features: "Show" en la primera feature y "Request" en la siguiente
    // (el guardado exige al menos una show y una request feature)
    await page.getByRole("tab", { name: "Features" }).click();
    const featureRows = page.locator("table tbody tr");
    await featureRows.first().getByLabel("Show", { exact: true }).check();
    await featureRows
      .filter({ hasText: "Lexical stem" })
      .first()
      .getByLabel("Request", { exact: true })
      .check();

    // Guardar → diálogo de nombre → redirect al navegador
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Specify File Name").waitFor();
    await page.getByLabel("Enter filename (without final “.3et”)").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/quiz\?path=ETCBC4%2Fdemo/);

    assert.ok(existsSync(filePath), "el .3et debe existir tras guardar");

    // El archivo aparece en el navegador
    await page.locator("li", { hasText: file }).waitFor();

    // Editar el archivo guardado: cambiar "Locate" y sobrescribir
    await page.locator("li", { hasText: file }).getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/quiz\/editor\?quiz=/);
    await editorReady(page);

    await page.getByRole("tab", { name: "Passages" }).click();
    const locate = page.locator("label", { hasText: "Locate" }).locator("[role='checkbox']");
    await locate.waitFor();
    await locate.click();
    assert.equal(await locate.getAttribute("aria-checked"), "false", "may_locate debe quedar desmarcado");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Overwrite?").waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Yes" }).click();
    await page.waitForURL(/\/quiz\?path=ETCBC4%2Fdemo/);

    // Test Exercise del archivo guardado → run con count=5
    await page.locator("li", { hasText: file }).getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/quiz\/editor\?quiz=/);
    await editorReady(page);
    await page.getByRole("button", { name: "Test Exercise" }).click();
    await page.waitForURL(/\/quiz\/test\?quiz=/);
    await page.getByRole("button", { name: "Check answer" }).waitFor();
    await page.getByRole("button", { name: "GRADE task" }).waitFor();
  } finally {
    if (existsSync(filePath)) unlinkSync(filePath);
    await ctx.close();
  }
});

test("alumno: ejecuta el ejercicio guardado por el profesor", { timeout: 240_000 }, async () => {
  const ctx: BrowserContext = await browser.newContext();
  const page: Page = await ctx.newPage();
  const name = newName();
  const file = `${name}.3et`;
  const filePath = path.join(QUIZZES_ROOT, QUIZ_DIR, file);

  try {
    // Preparar el ejercicio como profesor
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await login(teacherPage, "teacher");
    await openDemoDir(teacherPage);
    await teacherPage.getByRole("link", { name: "New exercise" }).click();
    await editorReady(teacherPage);
    await teacherPage.getByRole("tab", { name: "Passages" }).click();
    await teacherPage.locator("ul li input[type='checkbox']:visible").first().check();
    await teacherPage.getByRole("tab", { name: "Features" }).click();
    const tFeatureRows = teacherPage.locator("table tbody tr");
    await tFeatureRows.first().getByLabel("Show", { exact: true }).check();
    await tFeatureRows
      .filter({ hasText: "Lexical stem" })
      .first()
      .getByLabel("Request", { exact: true })
      .check();
    await teacherPage.getByRole("button", { name: "Save", exact: true }).click();
    await teacherPage.getByText("Specify File Name").waitFor();
    await teacherPage.getByLabel("Enter filename (without final “.3et”)").fill(name);
    await teacherPage.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    await teacherPage.waitForURL(/\/quiz\?path=ETCBC4%2Fdemo/);
    await teacherCtx.close();

    // Alumno: seleccionar pasajes y arrancar
    await login(page, "student");
    await openDemoDir(page);
    await page.locator("li", { hasText: file }).getByRole("link", { name: "Start" }).click();
    await page.waitForURL(/\/quiz\/universe/);
    await page.getByText("Select passage").waitFor();

    // Primer nodo con datos (un libro) marcado
    const firstCheckbox = page.locator("ul ul li input[type='checkbox']").first();
    await firstCheckbox.waitFor();
    await firstCheckbox.check();

    await page.getByRole("button", { name: /Start quiz/ }).click();
    await page.waitForURL(/\/quiz\/run\?quiz=/);
    await page.getByRole("button", { name: "Check answer" }).waitFor();
    await page.getByRole("button", { name: "GRADE task" }).waitFor();

    // Responder las 10 preguntas (input sin atributo type): contestar → corregir →
    // pasar a la siguiente. Next queda deshabilitado solo en la última.
    for (let qi = 0; qi < 10; qi++) {
      const reqInput = page.locator("tbody input").first();
      await reqInput.waitFor();
      await reqInput.fill(`answer ${qi}`);
      await page.getByRole("button", { name: "Check answer", exact: true }).click();
      await page.locator("td", { hasText: /^[✓✗]$/ }).first().waitFor();
      if (qi < 9) await page.getByRole("button", { name: "Next question", exact: true }).click();
    }

    // Gradar: estadísticas al servidor + redirect a la selección
    await page.getByRole("button", { name: "GRADE task", exact: true }).click();
    await page.waitForURL(/\/quiz$/);

    // El quiz quedó registrado con grading=1 y sus preguntas en la BD
    const appDb = new Database(path.join(process.cwd(), "data", "app.db"));
    const lastQuiz = appDb
      .prepare("SELECT id, grading, tot_questions FROM bol_sta_quiz WHERE userid = (SELECT id FROM bol_user WHERE username = 'student') ORDER BY id DESC LIMIT 1")
      .get() as { id: number; grading: number; tot_questions: number };
    assert.ok(lastQuiz, "debe haber un bol_sta_quiz para el alumno");
    assert.equal(lastQuiz.grading, 1, "el quiz se gradó");
    assert.ok(lastQuiz.tot_questions > 0, "tot_questions debe quedar calculado");
    const questionCount = (
      appDb.prepare("SELECT COUNT(*) AS n FROM bol_sta_question WHERE quizid = ?").get(lastQuiz.id) as { n: number }
    ).n;
    appDb.close();
    assert.ok(questionCount > 0, "debe haber preguntas registradas");
  } finally {
    if (existsSync(filePath)) unlinkSync(filePath);
    await ctx.close();
  }
});

/** Prepara un ejercicio en ETCBC4/demo como teacher (mismo flujo del test 2,
 *  con timer opcional configurado en el tab Timer) y devuelve el .3et creado. */
async function prepareExercise(browser: Browser, opts: { timerSeconds?: number } = {}): Promise<string> {
  const teacherCtx = await browser.newContext();
  const teacherPage = await teacherCtx.newPage();
  const file = `${newName()}.3et`;
  try {
    await login(teacherPage, "teacher");
    await openDemoDir(teacherPage);
    await teacherPage.getByRole("link", { name: "New exercise" }).click();
    await teacherPage.waitForURL(/\/quiz\/editor\?dir=/);
    await editorReady(teacherPage);
    await teacherPage.getByRole("tab", { name: "Passages" }).click();
    await teacherPage.locator("ul li input[type='checkbox']:visible").first().check();
    await teacherPage.getByRole("tab", { name: "Features" }).click();
    const featureRows = teacherPage.locator("table tbody tr");
    await featureRows.first().getByLabel("Show", { exact: true }).check();
    await featureRows
      .filter({ hasText: "Lexical stem" })
      .first()
      .getByLabel("Request", { exact: true })
      .check();
    if (opts.timerSeconds !== undefined) {
      await teacherPage.getByRole("tab", { name: "Timer" }).click();
      await teacherPage.locator("label", { hasText: /^Timer:/ }).locator("select").selectOption("on");
      await teacherPage
        .locator("label", { hasText: /^Seconds:/ })
        .locator("select")
        .selectOption(String(opts.timerSeconds));
    }
    await teacherPage.getByRole("button", { name: "Save", exact: true }).click();
    await teacherPage.getByText("Specify File Name").waitFor();
    await teacherPage.getByLabel("Enter filename (without final “.3et”)").fill(file.replace(".3et", ""));
    await teacherPage.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    await teacherPage.waitForURL(/\/quiz\?path=ETCBC4%2Fdemo/);
    return file;
  } finally {
    await teacherCtx.close();
  }
}

/** Alumno: navegador → Start → seleccionar el primer libro → arrancar el quiz. */
async function startQuiz(page: Page, file: string): Promise<void> {
  await login(page, "student");
  await openDemoDir(page);
  await page.locator("li", { hasText: file }).getByRole("link", { name: "Start" }).click();
  await page.waitForURL(/\/quiz\/universe/);
  await page.getByText("Select passage").waitFor();
  const firstCheckbox = page.locator("ul ul li input[type='checkbox']").first();
  await firstCheckbox.waitFor();
  await firstCheckbox.check();
  await page.getByRole("button", { name: /Start quiz/ }).click();
  await page.waitForURL(/\/quiz\/run\?quiz=/);
  await page.getByRole("button", { name: "Check answer" }).waitFor();
}

/** Contesta las `count` preguntas: input → Check answer → Next question. */
async function answerAll(page: Page, count: number): Promise<void> {
  for (let qi = 0; qi < count; qi++) {
    const reqInput = page.locator("tbody input").first();
    await reqInput.waitFor();
    await reqInput.fill(`answer ${qi}`);
    await page.getByRole("button", { name: "Check answer", exact: true }).click();
    await page.locator("td", { hasText: /^[✓✗]$/ }).first().waitFor();
    if (qi < count - 1) {
      await page.getByRole("button", { name: "Next question", exact: true }).click();
    }
  }
}

/** Último quiz registrado del alumno (lectura con conexión propia). */
function lastStudentQuiz(): { id: number; grading: number; tot_questions: number } {
  const appDb = new Database(path.join(process.cwd(), "data", "app.db"));
  const row = appDb
    .prepare("SELECT id, grading, tot_questions FROM bol_sta_quiz WHERE userid = (SELECT id FROM bol_user WHERE username = 'student') ORDER BY id DESC LIMIT 1")
    .get() as { id: number; grading: number; tot_questions: number } | undefined;
  appDb.close();
  assert.ok(row, "debe haber un bol_sta_quiz para el alumno");
  return row;
}

/** Número de preguntas registradas de un quiz. */
function questionCountOf(quizid: number): number {
  const appDb = new Database(path.join(process.cwd(), "data", "app.db"));
  const { n } = appDb.prepare("SELECT COUNT(*) AS n FROM bol_sta_question WHERE quizid = ?").get(quizid) as {
    n: number;
  };
  appDb.close();
  return n;
}

test("alumno: SAVE outcome guarda las estadísticas sin calificar", { timeout: 240_000 }, async () => {
  const ctx: BrowserContext = await browser.newContext();
  const page: Page = await ctx.newPage();
  const file = await prepareExercise(browser);
  const filePath = path.join(QUIZZES_ROOT, QUIZ_DIR, file);

  try {
    await startQuiz(page, file);
    await answerAll(page, 10);
    await page.getByRole("button", { name: "SAVE outcome", exact: true }).click();
    await page.waitForURL(/\/quiz$/);

    const quiz = lastStudentQuiz();
    assert.equal(quiz.grading, 0, "SAVE outcome no debe calificar");
    assert.ok(quiz.tot_questions > 0, "tot_questions debe quedar calculado");
    assert.ok(questionCountOf(quiz.id) > 0, "debe haber preguntas registradas");
  } finally {
    if (existsSync(filePath)) unlinkSync(filePath);
    await ctx.close();
  }
});

test("alumno: el temporizador envía las estadísticas al agotarse", { timeout: 240_000 }, async () => {
  const ctx: BrowserContext = await browser.newContext();
  const page: Page = await ctx.newPage();
  const file = await prepareExercise(browser, { timerSeconds: 1 });
  const filePath = path.join(QUIZZES_ROOT, QUIZ_DIR, file);

  try {
    await startQuiz(page, file);
    // total = number_small_questions (id2FeatVal.size, 24 features) ×
    // time_seconds (1s + buffer 3s = 4s) ≈ 96s de deadline, más el arranque.
    await page.waitForURL(/\/quiz$/, { timeout: 180_000 });

    const quiz = lastStudentQuiz();
    assert.equal(quiz.grading, 1, "el envío automático del temporizador califica");
    assert.ok(quiz.tot_questions > 0, "tot_questions debe quedar calculado");
    assert.ok(questionCountOf(quiz.id) > 0, "debe haber preguntas registradas");
  } finally {
    if (existsSync(filePath)) unlinkSync(filePath);
    const appDb = new Database(path.join(process.cwd(), "data", "app.db"));
    appDb.prepare("DELETE FROM bol_exerciseowner WHERE pathname = ?").run(`${QUIZ_DIR}/${file}`);
    appDb.close();
    await ctx.close();
  }
});

test("alumno: modo examen registra el resultado y finaliza", { timeout: 240_000 }, async () => {
  // Todavía no hay UI de exámenes: se inicializa el examen (definición +
  // instancia activa, la que referencian activeexamid y bol_exam_results)
  // directamente en la BD, como haría el flujo legacy de activación.
  const setupDb = new Database(path.join(process.cwd(), "data", "app.db"));
  const { lastInsertRowid } = setupDb
    .prepare("INSERT INTO bol_exam (exam_name, ownerid, examcode, examcodehash, archived) VALUES (?, ?, ?, ?, 0)")
    .run("e2e examen", 2, "e2e", "e2e");
  const examDefId = Number(lastInsertRowid);
  const now = Math.floor(Date.now() / 1000);
  const { lastInsertRowid: activeRow } = setupDb
    .prepare(
      "INSERT INTO bol_exam_active (exam_name, class_id, exam_start_time, exam_end_time, exam_length, exam_id, instance_name) VALUES (?, ?, ?, ?, NULL, ?, ?)",
    )
    .run("e2e examen", 1, now, now + 3600, examDefId, "e2e instancia");
  setupDb.close();
  const examid = Number(activeRow);

  const ctx: BrowserContext = await browser.newContext();
  const page: Page = await ctx.newPage();
  const file = await prepareExercise(browser);
  const filePath = path.join(QUIZZES_ROOT, QUIZ_DIR, file);

  try {
    await login(page, "student");
    await page.goto(`${BASE}/quiz/run?quiz=${encodeURIComponent(`${QUIZ_DIR}/${file}`)}&count=10&examid=${examid}`);
    await page.getByRole("button", { name: "Check answer" }).waitFor();
    await page.getByRole("button", { name: "Finish section" }).waitFor();
    await answerAll(page, 10);
    await page.getByRole("button", { name: "Finish section", exact: true }).click();
    // El examen finaliza en /exams/done (el runner ya no re-navega a /quiz).
    await page.waitForURL(`${BASE}/exams/done`, { timeout: 30_000 });

    const quiz = lastStudentQuiz();
    const checkDb = new Database(path.join(process.cwd(), "data", "app.db"));
    assert.equal(quiz.grading, 1, "en modo examen el quiz se califica");
    const res = checkDb
      .prepare("SELECT quizid FROM bol_exam_results WHERE userid = (SELECT id FROM bol_user WHERE username = 'student') AND activeexamid = ?")
      .get(examid) as { quizid: number } | undefined;
    assert.ok(res, "debe quedar registrado en bol_exam_results");
    assert.equal(res.quizid, quiz.id, "quizid del resultado = quiz del alumno");
    const finished = checkDb
      .prepare("SELECT COUNT(*) AS n FROM bol_exam_finished WHERE userid = (SELECT id FROM bol_user WHERE username = 'student') AND activeexamid = ?")
      .get(examid) as { n: number };
    assert.ok(finished.n > 0, "debe quedar marcado como finalizado");
    checkDb.close();
  } finally {
    if (existsSync(filePath)) unlinkSync(filePath);
    const cleanDb = new Database(path.join(process.cwd(), "data", "app.db"));
    cleanDb.prepare("DELETE FROM bol_exam_results WHERE activeexamid = ?").run(examid);
    cleanDb.prepare("DELETE FROM bol_exam_finished WHERE activeexamid = ?").run(examid);
    cleanDb.prepare("DELETE FROM bol_exam_active WHERE id = ?").run(examid);
    cleanDb.prepare("DELETE FROM bol_exam WHERE id = ?").run(examDefId);
    cleanDb.close();
    await ctx.close();
  }
});
