import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

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
    await page.waitForURL(new RegExp(`/quiz/run\\?quiz=${encodeURIComponent(`${QUIZ_DIR}/${file}`)}&count=5`));
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
  } finally {
    if (existsSync(filePath)) unlinkSync(filePath);
    await ctx.close();
  }
});
