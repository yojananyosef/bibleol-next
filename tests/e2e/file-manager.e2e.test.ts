import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import Database from "better-sqlite3";

/**
 * E2E del file manager (FASE 9): create folder, upload (valums XHR),
 * rename, delete file, delete folder — port de Ctrl_file_manager.
 * Corre sobre el build de producción (`next start -p 3996`); requiere
 * `npm run build` previo. Usa un directorio temporal e2e_tmp_* que se
 * limpia (fs + bol_exerciseowner) en after().
 */

const BASE = "http://localhost:3996";
const PORT = 3996;
let server: ChildProcess | null = null;
let browser: Browser;

const dirName = `e2e_tmp_${Date.now()}`;
const quizzesRoot = path.join(process.cwd(), "data", "quizzes");

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
  db.prepare("DELETE FROM bol_exerciseowner WHERE pathname LIKE ?").run(`${dirName}/%`);
  db.prepare("DELETE FROM bol_exercisedir WHERE pathname LIKE ?").run(`${dirName}%`);
  db.close();
  rmSync(path.join(quizzesRoot, dirName), { recursive: true, force: true });
  browser.close();
  server?.kill();
});

test("teacher: create folder, upload, rename, delete file, delete folder", async () => {
  const page = await browser.newPage();
  try {
    await login(page, "teacher");

    // ---------- Create folder ----------
    await page.goto(`${BASE}/file_manager`);
    await page.getByText("This is the top folder").waitFor();
    await page.getByRole("button", { name: "+ Create folder" }).click();
    await page.fill("#mkdir-name", dirName);
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.getByRole("link", { name: dirName, exact: true }).waitFor();

    // ---------- Navigate into folder ----------
    await page.getByRole("link", { name: dirName, exact: true }).click();
    await page.getByText(`Folder: ${dirName}`).waitFor();

    // ---------- Upload via /api/upload (XHR valums 1:1) ----------
    const uploadResponse = await page.request.post(
      `${BASE}/api/upload?dir=${encodeURIComponent(dirName)}&qqfile=e2e_quiz.3et`,
      { data: templateXml() },
    );
    assert.equal(uploadResponse.ok(), true);
    const uploadJson = await uploadResponse.json();
    assert.equal(uploadJson.success, true);

    // The uploaded file has the teacher as owner
    const db = new Database(path.join(process.cwd(), "data", "app.db"));
    const ownerRow = db
      .prepare("SELECT ownerid FROM bol_exerciseowner WHERE pathname = ?")
      .get(`${dirName}/e2e_quiz.3et`) as { ownerid: number } | undefined;
    db.close();
    assert.ok(ownerRow, "el fichero subido debe tener dueño");
    assert.ok(Number(ownerRow.ownerid) > 0);

    // ---------- File appears in the listing ----------
    await page.goto(`${BASE}/file_manager?dir=${encodeURIComponent(dirName)}`);
    await page.getByRole("heading", { name: "Exercises" }).waitFor();
    await page.getByText("e2e_quiz", { exact: false }).first().waitFor();

    // ---------- Rename ----------
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await page.fill("#rename-newname", "renamed_quiz");
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.getByText("renamed_quiz", { exact: false }).first().waitFor();

    // ---------- Delete marked file ----------
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Delete marked files" }).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await page.getByText("renamed_quiz").waitFor({ state: "detached" });

    // ---------- Delete (empty) folder ----------
    await page.goto(`${BASE}/file_manager`);
    const row = page.getByRole("link", { name: dirName, exact: true }).locator("..").locator("..");
    await row.getByRole("button", { name: "Delete folder" }).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await page.getByRole("link", { name: dirName, exact: true }).waitFor({ state: "detached" });

    assert.ok(!existsSync(path.join(quizzesRoot, dirName)), "el directorio debe haberse borrado");
  } finally {
    await page.close();
  }
});

/** XML mínimo de plantilla (harvest no lo parsea aquí; solo es un .3et). */
function templateXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questiontemplate version="6">
  <desc><![CDATA[e2e]]></desc>
  <database>ETCBC4</database>
  <properties>ETCBC4</properties>
  <path>Genesis:1</path>
</questiontemplate>
`;
}