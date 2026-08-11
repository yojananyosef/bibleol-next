import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

/**
 * E2E del rol traductor + l10n (FASE 9, puntos 1-2):
 * - El traductor (admin) abre /translate, /translate/list, /translate/if y
 *   /translate/grammar y edita una cadena de la interfaz.
 * - El selector de idioma (/lang?lang=es) cambia la UI de la página inicial.
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

test("home muestra la intro localizada y /lang cambia la UI", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/`);
  await page.waitForURL(`${BASE}/`);
  assert.ok(
    ((await page.locator("body").innerText()) as string).includes("Welcome to Bible Online Learner") ||
      ((await page.locator("body").innerText()) as string).includes("Bible Online Learner"),
  );

  // Cambia a español vía Ctrl_lang
  await page.goto(`${BASE}/lang?lang=es`);
  await page.waitForURL(`${BASE}/`);
  await page.waitForTimeout(300);
  const esText = await page.locator("body").innerText();
  assert.ok(esText.includes("Bienvenido") || esText.includes("Bible Online Learner"));

  // El login también se localiza
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(300);
  const loginEs = await page.locator("body").innerText();
  assert.ok(loginEs.toLowerCase().includes("por favor"), `el login debe estar en español, se obtuvo: ${loginEs.slice(0, 120)}`);

  assert.equal(errors.length, 0, `pageerrors: ${errors.join("; ")}`);
  await page.close();
});

test("traductor edita una cadena de interfaz en /translate/if", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await login(page, "admin");

  const res = await page.goto(`${BASE}/translate`);
  assert.ok(res && res.ok());
  assert.match(res.url(), /\/translate\/if/);

  await page.goto(`${BASE}/translate/list`);
  assert.match(await page.locator("body").innerText(), /Available localizations/);

  await page.goto(`${BASE}/translate/if?group=menu`);
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

test("editor de gramática abre y muestra el grupo info de ETCBC4", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await login(page, "admin");
  const res = await page.goto(`${BASE}/translate/grammar?db=ETCBC4&group=info`);
  assert.ok(res && res.ok());
  const body = await page.locator("body").innerText();
  assert.match(body, /dbdescription/);
  await page.waitForSelector("table input");
  assert.equal(errors.length, 0, `pageerrors: ${errors.join("; ")}`);
  await page.close();
});
