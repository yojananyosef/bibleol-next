/**
 * Paridad de Db_config + TypeInfo con Db_config.php / typeinfo.inc.php.
 * Usa data/meta real (los tests se saltan si no existe el directorio).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { DbConfig, DatabaseFile, TypeInfo, defaultLocalize } from "../../src/lib/corpus/db-config.ts";
import { openEmdros } from "../../src/lib/corpus/emdros-schema.ts";
import { createMql } from "../../src/lib/corpus/mql.ts";
import { CORPUS_DIR, META_DIR } from "../../src/lib/db/sqlite.ts";
import path from "node:path";

const skipNoMeta = { skip: !existsSync(META_DIR) };

test("DbConfig: escaneo de corpora (allfiles/allfiles_enumerate)", skipNoMeta, () => {
  const cfg = new DbConfig(META_DIR);
  const names = Object.keys(cfg.allfiles).sort();
  assert.deepEqual(names, ["ETCBC4", "ETCBC4-translit", "jvulgate", "nestle1904"]);
  // Ninguno tiene superset → todos se enumeran
  assert.deepEqual(Object.keys(cfg.allfiles_enumerate).sort(), names);
});

test("DatabaseFile: rutas desde databaseName/propertiesName", skipNoMeta, () => {
  const dbf = new DatabaseFile({
    databaseName: "ETCBC4",
    propertiesName: "ETCBC4-translit",
    subsetOf: null,
  });
  assert.equal(dbf.emdros_db, "db/ETCBC4"); // el translit comparte el corpus base
  assert.equal(dbf.dbinfo, "db/ETCBC4-translit.db.json");
  assert.equal(dbf.typeinfo, "db/ETCBC4.typeinfo.json");
  assert.equal(dbf.bookorder, "db/ETCBC4.bookorder");
  assert.equal(dbf.getSuperProp(), null);
});

test("DbConfig: initConfig ETCBC4 en", skipNoMeta, () => {
  const cfg = new DbConfig(META_DIR);
  assert.ok(cfg.initConfig("ETCBC4", "ETCBC4", "en"));
  assert.equal(cfg.emdros_db, "db/ETCBC4");
  assert.deepEqual(cfg.src_lang, ["Hebrew", "Aramaic"]);
  assert.ok(cfg.glosslang.some((g) => g.abb === "en" && g.internal === "english"));

  const dbinfo = JSON.parse(cfg.dbinfo_json);
  assert.equal(dbinfo.granularity, "sentence");
  assert.equal(dbinfo.objHasSurface, "word");
  assert.equal(dbinfo.surfaceFeature, "g_word_utf8");
  assert.deepEqual(dbinfo.universeHierarchy.map((u: { type: string }) => u.type), ["book", "chapter", "verse"]);

  // addgloss_dbinfo: featuresetting.gloss → por idioma con sql_command LANG
  const ws = dbinfo.objectSettings.word.featuresetting;
  assert.equal(ws.gloss, undefined);
  assert.equal(ws.english.isGloss, true);
  assert.ok(ws.english.sql_command.includes("lexicon_Hebrew") || ws.english.sql_command.includes("LANG") === false);
  assert.equal(ws.english.fontsize, "tenpoint");
  assert.equal(ws.danish.isGloss, true);

  // addgloss_typeinfo_json: features gloss como string en obj2feat
  const ti = JSON.parse(cfg.typeinfo_json);
  assert.equal(ti.obj2feat.word.english, "string");
  assert.equal(ti.obj2feat.word.sp, "part_of_speech_t");
  assert.equal(ti.obj2feat.word.verb_class, "list of verb_class_t");

  // typeinfo: 12 objetos, enums y bookorder
  assert.equal(cfg.typeinfo!.objTypes.length, 12);
  assert.ok(cfg.typeinfo!.enumTypes.includes("part_of_speech_t"));
  assert.ok(cfg.typeinfo!.enum2values.part_of_speech_t.includes("prep"));
  assert.deepEqual(cfg.bookorder[0], ["Genesis", "1-50"]);
  assert.equal(cfg.bookorder.length, 39);

  // l10n con addgloss_l10n_json
  const l10n = JSON.parse(cfg.l10n_json);
  assert.equal(l10n.emdrosobject.word._objname, "Word");
  assert.equal(l10n.emdrosobject.word.english, "English");
});

test("DbConfig: l10n no-en fusiona con el inglés", skipNoMeta, () => {
  const cfg = new DbConfig(META_DIR);
  cfg.initConfig("ETCBC4", "ETCBC4", "da");
  const l10n = JSON.parse(cfg.l10n_json);
  // Términos daneses presentes y los faltantes vienen del inglés
  assert.equal(l10n.emdrosobject.word._objname, "Ord");
  assert.equal(l10n.emdrosobject.word.english, "English");
});

test("DbConfig: initConfig ilegal lanza error", skipNoMeta, () => {
  const cfg = new DbConfig(META_DIR);
  assert.throws(() => cfg.initConfig("no_such_db", "no_such_db", "en"), /Illegal database name/);
  assert.equal(cfg.initConfig("no_such_db", "no_such_db", "en", false), false);
});

test("DbConfig: nestle1904 y jvulgate (src_lang, bookorder NT)", skipNoMeta, () => {
  const cfg = new DbConfig(META_DIR);
  cfg.initConfig("nestle1904", "nestle1904", "en");
  assert.deepEqual(cfg.src_lang, ["greek"]);
  assert.equal(cfg.bookorder.length, 27);
  assert.deepEqual(cfg.bookorder[0], ["Matthew", "1-28"]);
  const nestleDbinfo = JSON.parse(cfg.dbinfo_json);
  assert.equal(nestleDbinfo.surfaceFeature, "surface");

  cfg.initConfig("jvulgate", "jvulgate", "en");
  assert.deepEqual(cfg.src_lang, ["latin"]);
  const vulDbinfo = JSON.parse(cfg.dbinfo_json);
  assert.equal(vulDbinfo.surfaceFeature, "surface");
});

test("TypeInfo.fromMql coincide con el typeinfo.json almacenado (ETCBC4)", skipNoMeta, () => {
  const corpus = path.join(CORPUS_DIR, "ETCBC4");
  if (!existsSync(corpus)) return; // sin corpus: no verificable
  const db = new Database(corpus, { readonly: true });
  try {
    const emd = openEmdros(db, "ETCBC4");
    const ti = TypeInfo.fromMql(createMql(emd));
    const cfg = new DbConfig(META_DIR);
    cfg.initConfig("ETCBC4", "ETCBC4", "en");
    const stored = JSON.parse(cfg.typeinfo_json);
    assert.equal(ti.objTypes.length, stored.objTypes.length);
    assert.equal(ti.obj2feat.word.sp, stored.obj2feat.word.sp);
    assert.equal(ti.obj2feat.word.verb_class, stored.obj2feat.word.verb_class);
    assert.equal(ti.obj2feat.word.lex, "string");
    assert.equal(ti.obj2feat.word.self, "id_d");
  } finally {
    db.close();
  }
});

test("defaultLocalize: prop.pretty.json como fallback sin seed", skipNoMeta, () => {
  const cfg = new DbConfig(META_DIR, { localize: defaultLocalize(META_DIR) });
  cfg.initConfig("ETCBC4", "ETCBC4", "en");
  const l10n = JSON.parse(cfg.l10n_json);
  assert.equal(l10n.emdrosobject.word._objname, "Word");
  assert.equal(l10n.dbdescription, "Hebrew (ETCBC4, OT)");
});
