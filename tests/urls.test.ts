import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";

// FASE 9 — URLs para glosas: Mod_urls (get_glosses, get_heb_urls,
// create/set/delete_heb_url), botones heb/aram e iconos (L_icon).

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-urls-"));
copyFileSync(path.join(process.cwd(), "data", "lexicons.db"), path.join(TMP, "lexicons.db"));
process.env.BIBLEOL_DATA_DIR = TMP;

let db: Database.Database;
let urls: typeof import("../src/lib/services/urls.ts");

before(async () => {
  const { getAppDb } = await import("../src/lib/db/sqlite.ts");
  urls = await import("../src/lib/services/urls.ts");
  db = getAppDb();
});

after(() => {
  db.close();
});

test("src_lang_short2long: corto → largo (y error para códigos ilegales)", () => {
  assert.equal(urls.srcLangShort2long("heb"), "Hebrew");
  assert.equal(urls.srcLangShort2long("aram"), "Aramaic");
  assert.throws(() => urls.srcLangShort2long("xyz"), /illegal_lang_code/);
});

test("get_heb_buttons/get_aram_buttons: 26 botones heb y 2 aram", () => {
  const heb = urls.getHebButtons();
  const aram = urls.getAramButtons();
  assert.equal(heb.length, 26);
  assert.equal(aram.length, 2);
  assert.equal(heb[0][1], "ab");
  assert.equal(heb[25][2], "zz");
  assert.deepEqual(aram[0], ["&#x05d0;&#x05d1;-&#x05de;&#x05d5;", "ab", "mg"]);
  assert.deepEqual(aram[1], ["&#x05de;&#x05d6;-&#x05ea;&#x05ea;", "mg", "zz"]);
});

test("get_glosses: un lexema por fila en el rango, ordenado", () => {
  const words = urls.getGlosses("Hebrew", "ab", "ak");
  assert.ok(words.length > 0);
  for (const w of words) {
    assert.ok(w.gloss && w.vocalized_lexeme_utf8 && w.roman, `fila incompleta: ${JSON.stringify(w)}`);
  }
  const lexes = new Set(words.map((w) => w.lex));
  assert.equal(lexes.size, words.length, "sin lexemas repetidos");
});

test("get_frequent_glosses: al menos gloss_count glosas, una por lexema", () => {
  const words = urls.getFrequentGlosses("Hebrew", 300);
  assert.ok(words.length >= 300);
  const lexes = new Set(words.map((w) => w.lex));
  assert.equal(lexes.size, words.length);
  assert.ok(words[0].tally >= words[words.length - 1].tally, "orden por frecuencia");
});

test("get_heb_urls puebla .urls solo cuando existen enlaces", () => {
  const words = urls.getGlosses("Hebrew", "ab", "ak");
  assert.ok(!words[0].urls, "sin enlaces previos");
  const lex = words[0].lex;
  db.prepare("INSERT INTO bol_heb_urls (lex, language, url, icon) VALUES (?, 'Hebrew', 'https://example.com', 'l-icon-link')").run(lex);
  urls.getHebUrls("Hebrew", [words[0]]);
  const withUrls = words[0].urls as unknown as { id: number; url: string }[];
  assert.equal(withUrls.length, 1);
  assert.equal(withUrls[0].url, "https://example.com");
  const others = urls.getGlosses("Hebrew", "ab", "ak").slice(1);
  urls.getHebUrls("Hebrew", others);
  assert.ok(others.every((w) => !w.urls), "sin enlaces → sin .urls");
});

test("create/set/delete_heb_url round-trip", () => {
  const lex = "XYZXYZ";
  urls.createHebUrl(lex, "Aramaic", "https://a.com/a", "l-icon-book");
  let row = db
    .prepare("SELECT * FROM bol_heb_urls WHERE lex = ? AND language = 'Aramaic'")
    .get(lex) as { id: number; url: string; icon: string } | undefined;
  assert.ok(row);
  urls.setHebUrl(row.id, "https://b.com/b", "l-icon-globe");
  row = db.prepare("SELECT * FROM bol_heb_urls WHERE id = ?").get(row.id) as typeof row;
  assert.equal(row.url, "https://b.com/b");
  assert.equal(row.icon, "l-icon-globe");
  urls.deleteHebUrl(row.id);
  const n = (db.prepare("SELECT COUNT(*) AS n FROM bol_heb_urls WHERE lex = ?").get(lex) as { n: number }).n;
  assert.equal(n, 0);
});

test("iconCssClass: nombres conocidos → clase fontawesome, desconocidos → link", () => {
  assert.equal(urls.iconCssClass("l-icon-link"), "fas fa-link");
  assert.equal(urls.iconCssClass("l-icon-speaker"), "fas fa-volume-down");
  assert.equal(urls.iconCssClass("no-such-icon"), "fas fa-link");
  assert.equal(urls.ICON_NAMES.length, 9);
});