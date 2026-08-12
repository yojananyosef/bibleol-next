import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";

// FASE 9 — i18n léxico: getAllLexiconLangs, getNumberGlosses, getGlossesForEdit,
// getFrequentGlossesForEdit, updateGlosses y getLocalized* (Mod_translate).

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-lex-"));
copyFileSync(path.join(process.cwd(), "data", "lexicons.db"), path.join(TMP, "lexicons.db"));
cpSync(path.join(process.cwd(), "data", "meta"), path.join(TMP, "meta"), { recursive: true });
process.env.BIBLEOL_DATA_DIR = TMP;

let db: Database.Database;
let tr: typeof import("../src/lib/services/translate.ts");

before(async () => {
  const { getAppDb } = await import("../src/lib/db/sqlite.ts");
  tr = await import("../src/lib/services/translate.ts");
  db = getAppDb();
});

after(() => {
  db.close();
});

test("getAllLexiconLangs: flags heblex/greeklex/latinlex → idiomas por src_lang", () => {
  const langs = tr.getAllLexiconLangs();
  const keys = (o: Record<string, string>) => Object.keys(o).sort();
  assert.deepEqual(keys(langs.heb), ["am", "da", "de", "en", "es", "nl", "pt", "sw"]);
  assert.deepEqual(keys(langs.aram), ["am", "da", "de", "en", "es", "nl", "pt", "sw"]);
  assert.deepEqual(keys(langs.greek), ["am", "da", "en", "es", "nl", "pt", "sw"]);
  assert.deepEqual(keys(langs.latin), ["da", "en"]);
  assert.equal(langs.heb.en, "English");
});

test("getNumberGlosses: cuenta lexemas con tally > min_tally", () => {
  const heb = tr.getNumberGlosses("heb");
  const aram = tr.getNumberGlosses("aram");
  const greek = tr.getNumberGlosses("greek");
  assert.ok(heb > 0);
  assert.ok(aram > 0);
  assert.ok(greek > 0);
  assert.ok(heb > aram, "el léxico hebreo es mayor que el arameo");
});

test("getGlossesForEdit: filas completas ordenadas por sortorder", () => {
  const rows = tr.getGlossesForEdit("heb", "en", "en", "ab", "ak", null);
  assert.ok(rows.length > 0, "rango ab-ak con glosas");
  for (const r of rows) {
    assert.ok(r.lex_id > 0 && r.tally > 0 && r.lexeme, `fila incompleta: ${JSON.stringify(r)}`);
    assert.ok(r.text_show !== null, "glosa en inglés presente");
  }
});

test("getGlossesForEdit: latin tiene part_of_speech y greek strongs", () => {
  const latin = tr.getGlossesForEdit("latin", "en", "en", "aar", "acc", null);
  assert.ok(latin.length > 0);
  assert.ok(latin[0].part_of_speech !== "", "part_of_speech presente");
  const greek = tr.getGlossesForEdit("greek", "en", "en", "ααρ", "αγο", null);
  assert.ok(greek.length > 0);
  assert.ok("strongs" in greek[0]);
});

test("getFrequentGlossesForEdit: glosas con mayor tally primero", () => {
  const rows = tr.getFrequentGlossesForEdit("heb", "en", "en", 0, 100, null);
  assert.equal(rows.length, 100);
  assert.ok(rows[0].tally >= rows[rows.length - 1].tally, "orden por frecuencia");
  const greek = tr.getFrequentGlossesForEdit("greek", "en", "en", 0, 100, null);
  assert.equal(greek.length, 100);
});

test("updateGlosses: inserta, actualiza y borra con variante", () => {
  const base = tr.getGlossesForEdit("heb", "en", "en", "ab", "ak", null);
  const id = String(base[0].lex_id);
  tr.updateGlosses("heb", "en", { [`modif-${id}`]: "true", [id]: "mi glosa" }, null);
  const after1 = tr.getGlossesForEdit("heb", "en", "en", "ab", "ak", null);
  const row = after1.find((r) => String(r.lex_id) === id);
  assert.equal(row?.text_edit, "mi glosa");

  // Variante vacía → borra la fila de variante y vuelve a la base
  tr.updateGlosses("heb", "en", { [`modif-${id}`]: "true", [id]: " " }, "x");
  const after2 = tr.getGlossesForEdit("heb", "en", "en", "ab", "ak", null);
  assert.equal(after2.find((r) => String(r.lex_id) === id)?.text_edit, "mi glosa");

  // Variante igual a la base también se borra
  tr.updateGlosses("heb", "en", { [`modif-${id}`]: "true", [id]: "mi glosa" }, "x");
  const after3 = tr.getGlossesForEdit("heb", "en", "en", "ab", "ak", null);
  assert.equal(after3.find((r) => String(r.lex_id) === id)?.text_edit, "mi glosa");
  tr.updateGlosses("heb", "en", { [`modif-${id}`]: "true", [id]: "mi glosa" }, "x");
  const after4 = tr.getGlossesForEdit("heb", "en", "en", "ab", "ak", null);
  assert.equal(after4.find((r) => String(r.lex_id) === id)?.text_edit, "mi glosa");

  // Restaura
  const original = base[0].text_edit ?? "";
  tr.updateGlosses("heb", "en", { [`modif-${id}`]: "true", [id]: original }, null);
  const after5 = tr.getGlossesForEdit("heb", "en", "en", "ab", "ak", null);
  assert.equal(after5.find((r) => String(r.lex_id) === id)?.text_edit, original);
});

test("updateGlosses: sin modif->true no toca nada", () => {
  const base = tr.getGlossesForEdit("greek", "da", "en", "ααρ", "αγο", null);
  tr.updateGlosses("greek", "da", { "modif-12345": "false", "12345": "no" }, null);
  const after = tr.getGlossesForEdit("greek", "da", "en", "ααρ", "αγο", null);
  assert.deepEqual(after.map((r) => r.text_edit), base.map((r) => r.text_edit));
});

test("getLocalizedETCBC4: stems verbal_stem_t + books universe.reference", () => {
  const [stems, books] = tr.getLocalizedETCBC4("en");
  assert.ok(Object.keys(stems).length > 0, "verbal_stem_t traducido");
  assert.ok(books["Genesis"], "abreviatura de libro");
  assert.equal(books["_label"], "%s %d:%d");
});

test("getLocalizedNoStems: nestle1904 sin stems pero con books", () => {
  const [stems, books] = tr.getLocalizedNoStems("nestle1904", "en");
  assert.deepEqual(stems, {});
  assert.ok(books["Matthew"], "abreviatura de libro");
});

test("illegal src_lang / lang: lanzan error", () => {
  assert.throws(() => tr.getNumberGlosses("xyz"), /illegal_lang_code/);
  assert.throws(() => tr.updateGlosses("heb", "en", { "modif-1": "true", "1": "x" }, "fo oʻ"), /Illegal language code/);
});