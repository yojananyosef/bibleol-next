import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

/**
 * E2E de la gestión de URLs para glosas (FASE 9, punto 3):
 * - /urls lista botones heb/aram (frecuencia + alfabético) y greek/latin "no present".
 * - /urls/edit-url muestra la tabla de lexemas con enlaces.
 * - El administrador crea un enlace nuevo desde el diálogo.
 * Requiere `npm run build` previo.
 */

const BASE = "http://localhost:3999";
const PORT = 3999;
let server: ChildProcess | null = null;
let browser: Browser;

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
  await page.getByRole("button").first().click();
  await page.waitForURL(`${BASE}/`);
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
  browser?.close();
  server?.kill();
});

test("estudiantes no ven 'Gloss links' en el menú; admin sí", async () => {
  const page = await browser.newPage();
  await login(page, "student");
  const studentText = await page.locator("body").innerText();
  assert.ok(!studentText.includes("Gloss links"), "el alumno no debe ver el enlace");
  await page.close();

  const page2 = await browser.newPage();
  await login(page2, "admin");
  const adminText = await page2.locator("body").innerText();
  assert.ok(adminText.includes("Gloss links"), "el admin debe ver el enlace");
  await page2.close();
});

test("/urls: botones heb/aram y avisos de greek/latin ausentes", async () => {
  const page = await browser.newPage();
  await login(page, "admin");
  const res = await page.goto(`${BASE}/urls`);
  assert.ok(res && res.ok());
  const body = await page.locator("body").innerText();
  assert.ok(body.includes("Hebrew glosses"));
  assert.ok(body.includes("Aramaic glosses"));
  assert.ok(body.includes("Greek glosses"));
  assert.ok(body.includes("Latin glosses"));
  assert.ok(body.includes("Sorry, no Greek at present."));
  assert.ok(body.includes("Sorry, no Latin at present."));
  assert.ok(body.includes("By frequency"));
  assert.ok(body.includes("Alphabetically"));
  // 26 botones heb + 2 aram + frecuencia
  const btns = await page.locator(".btn-gloss-selector").count();
  assert.ok(btns >= 28, `botones de glosa: ${btns}`);
  await page.close();
});

test("edit-url: tabla de lexemas y creación de un enlace", async () => {
  const page = await browser.newPage();
  page.on("pageerror", (e) => assert.fail(`pageerror: ${e.message}`));
  await login(page, "admin");

  const res = await page.goto(`${BASE}/urls/edit-url?src_lang=heb&buttonix=-1`);
  assert.ok(res && res.ok());

  const tbl = page.locator("table.table");
  await tbl.waitFor({ state: "visible" });
  const headers = (await tbl.locator("thead th").allInnerTexts()).map((s) => s.trim());
  assert.deepEqual(headers, ["Lexeme", "English", "Icon", "Link", "Operations"]);

  const add = page.locator("a.badge-primary", { hasText: "Add link" }).first();
  await add.waitFor({ state: "visible" });
  await add.click();

  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible" });
  await dialog.locator("input").first().fill(`https://example.com/${Date.now()}`);
  await dialog.getByRole("button", { name: "OK" }).click();

  // Tras el redirect con scrolltop, la página vuelve a cargarse
  await page.waitForURL(/scrolltop=/);
  const body = await page.locator("body").innerText();
  assert.ok(body.includes("Add link"));
  await page.close();
});