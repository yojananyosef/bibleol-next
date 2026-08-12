import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

/**
 * E2E del editor de léxico (FASE 9, i18n léxico):
 * - /translate/lexicon muestra los botones de frecuencia y alfabéticos.
 * - /translate/edit-lex muestra la tabla de glosas y guarda un cambio.
 * Requiere `npm run build` previo.
 */

const BASE = "http://localhost:3998";
const PORT = 3998;
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

test("/translate/lexicon muestra los selectores de glosas", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await login(page, "admin");
  const res = await page.goto(`${BASE}/translate/lexicon`);
  assert.ok(res && res.ok());
  const body = await page.locator("body").innerText();
  assert.match(body, /Translate lexicon/);
  assert.match(body, /By frequency/);
  await page.waitForSelector('a[href*="/translate/edit-lex?src_lang=heb"]');

  assert.equal(errors.length, 0, `pageerrors: ${errors.join("; ")}`);
  await page.close();
});

test("/translate/edit-lex edita y guarda una glosa", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await login(page, "admin");
  const res = await page.goto(`${BASE}/translate/edit-lex?src_lang=heb&buttonix=-1`);
  assert.ok(res && res.ok());
  await page.waitForSelector("table input");
  const first = page.locator("table input").first();
  const orig = await first.inputValue();
  await first.fill(`${orig} `);
  await page.locator('input[name^="modif-"][value="true"]').first().waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Submit changes" }).click();
  await page.waitForTimeout(800);

  assert.equal(errors.length, 0, `pageerrors: ${errors.join("; ")}`);
  await page.close();
});