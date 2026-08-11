import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TEST_DATA = mkdtempSync(path.join(tmpdir(), "bibleol-i18n-test-"));
process.env.BIBLEOL_DATA_DIR = TEST_DATA;

let translate: typeof import("../../src/lib/services/translate.ts");
let getAppDb: () => import("better-sqlite3").Database;

before(async () => {
  translate = await import("../../src/lib/services/translate.ts");
  const dbmod = await import("../../src/lib/db/sqlite.ts");
  getAppDb = dbmod.getAppDb;
  // Enlaza data/meta real para poder leer los JSON de gramática
  mkdirSync(path.join(TEST_DATA, "meta"), { recursive: true });
  try {
    symlinkSync(path.join(process.cwd(), "data", "meta", "ETCBC4.comment.prop.pretty.json"), path.join(TEST_DATA, "meta", "ETCBC4.comment.prop.pretty.json"));
  } catch {
    // ya existe (varias ejecuciones sobre el mismo TEST_DATA no ocurren: es único)
  }
  // Importa en + comment desde langsrc (archivos reales del repo)
  translate.importCommentFromSrc();
  translate.importLangFromSrc("en");
});

after(() => {
  void translate._unused;
});

test("importLangFromSrc: bol_language_en poblada y tablas con guion se crean (zh-Hans)", () => {
  translate.importLangFromSrc("zh-Hans");
  const n = (getAppDb().prepare(`SELECT COUNT(*) n FROM "bol_language_zh-Hans"`).get() as { n: number }).n;
  assert.ok(n > 0, "zh-Hans debe poder crearse (backticks)");
});

test("countIfLines: claves canónicas y traducciones de referencia", () => {
  const total = translate.countIfLines(null);
  const en = translate.countIfTranslated("en");
  // en (944 claves de langsrc) puede exceder el canon (932 filas de comment)
  assert.ok(total > 0);
  assert.ok(en >= total);
});

test("getIfLinesPart: devuelve filas con texto en el idioma mostrado", () => {
  const rows = translate.getIfLinesPart("da", "en", "menu", 10, 0, "symbolic_name", "asc");
  assert.ok(rows.length > 0);
  const cls = rows.find((r) => r.symbolic_name === "classes");
  assert.ok(cls, "debe existir la clave 'classes' en el grupo menu");
  assert.ok(cls.text_show !== null);
});

test("updateIfLines: guarda y borra filas (variante)", () => {
  translate.updateIfLines("en", "menu", { "modif-classes": "true", classes: "Início" }, null);
  const rows = translate.getIfLinesPart("en", "en", "menu", 10, 0, "symbolic_name", "asc");
  assert.equal(rows.find((r) => r.symbolic_name === "classes")?.text_edit, "Início");

  // Variante de zh-Hans
  translate.updateIfLines("zh-Hans", "menu", { "modif-classes": "true", classes: "变体" }, "variant");
  const vRows = translate.getIfLinesPart("zh-Hans_variant", "zh-Hans_variant", "menu", 10, 0, "symbolic_name", "asc");
  assert.equal(vRows.find((r) => r.symbolic_name === "classes")?.text_edit, "变体");

  // Borrar variante devolviendo el mismo texto que la base
  const base = translate.getIfLinesPart("zh-Hans", "zh-Hans", "menu", 10, 0, "symbolic_name", "asc").find((r) => r.symbolic_name === "classes")?.text_edit ?? "";
  if (!base) throw new Error("base en blanco");
  translate.updateIfLines("zh-Hans", "menu", { "modif-classes": "true", classes: "" }, "variant");
  const afterDelete = translate.getIfLinesPart("zh-Hans_variant", "zh-Hans_variant", "menu", 10, 0, "symbolic_name", "asc");
  const row = afterDelete.find((r) => r.symbolic_name === "classes");
  // al igualar la base vacía la fila de variante se borra: text_edit cae a null o ""
  assert.ok(row === undefined || row.text_edit === null || row.text_edit === "", "al borrar la variante la fila no debe tener texto de variante");
});

test("getIfUntranslated: lista claves sin traducción en el idioma editable", () => {
  translate.importLangFromSrc("am");
  const untr = translate.getIfUntranslated("am");
  assert.ok(Array.isArray(untr));
  assert.ok(untr.length > 0);
});

test("gramática: grupos, conteo y update (ETCBC4)", () => {
  const groups = translate.getGrammargroupList("ETCBC4");
  assert.ok(groups.includes("info"));
  const total = translate.countGrammarLines("ETCBC4");
  assert.ok(total > 0);

  translate.updateGrammarLines("es", "ETCBC4", { "modif-dbdescription": "true", dbdescription: "descripción" }, null);
  const lines = translate.getGrammarLinesPart("es", "en", "ETCBC4", "info");
  const row = lines.find((l) => l.symbolic_name === "dbdescription");
  assert.ok(row, "debe existir la clave info.dbdescription en ETCBC4");
  assert.equal(row!.text_edit, "descripción");
});

test("modifyLocalization + addLanguage", () => {
  assert.ok("es" in translate.getIfLanguages());
  translate.modifyLocalization(false, "iface", "es");
  assert.ok(!("es" in translate.getIfLanguages()));
  translate.modifyLocalization(true, "iface", "es");
  translate.addLanguage("nb", "Norwegian", "Norsk");
  assert.ok("nb" in translate.getIfLanguages());
});
