/**
 * Paridad 1:1 del motor MQL→SQL con las consultas reales de BibleOL
 * (Mod_askemdros, Dictionary, Quiz_data) sobre los corpora Emdros descargados.
 * Los tests se saltan si falta el corpus (BIBLEOL_DATA_DIR).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { openEmdros } from "../../src/lib/corpus/emdros-schema.ts";
import { createMql } from "../../src/lib/corpus/mql.ts";
import { htmlSpecialChars } from "../../src/lib/corpus/sheaf.ts";
import { CORPUS_DIR } from "../../src/lib/db/sqlite.ts";

interface Corpus {
  db: Database.Database;
  emd: ReturnType<typeof openEmdros>;
  mql: ReturnType<typeof createMql>;
}

function openCorpus(name: string): Corpus | null {
  const file = path.join(CORPUS_DIR, name);
  if (!existsSync(file)) return null;
  const db = new Database(file, { readonly: true });
  const emd = openEmdros(db, name);
  return { db, emd, mql: createMql(emd) };
}

const etcbc = openCorpus("ETCBC4");
const nestle = openCorpus("nestle1904");
const jvulgate = openCorpus("jvulgate");
const skipNoCorpus = { skip: etcbc === null };
const skipNoNestle = { skip: nestle === null };
const skipNoJvulgate = { skip: jvulgate === null };

// ─────────────────────────────────────────────────────────────────────────────
// sheaf: html-encoding idéntico a htmlspecialchars de PHP
// ─────────────────────────────────────────────────────────────────────────────

test("htmlSpecialChars: ENT_QUOTES como PHP", () => {
  assert.equal(htmlSpecialChars(`<a href="x" 'y'> &`), "&lt;a href=&quot;x&quot; &#039;y&#039;&gt; &amp;");
});

// ─────────────────────────────────────────────────────────────────────────────
// ETCBC4 (Corpus Workbench Hebrew)
// ─────────────────────────────────────────────────────────────────────────────

test("ETCBC4: MIN_M/MAX_M del universo", skipNoCorpus, () => {
  const res = etcbc!.mql.exec("SELECT MIN_M GOqxqxqx\nSELECT MAX_M GOqxqxqx\n");
  assert.equal(res[0].get_table()!.get_cell(0, 0), "1");
  assert.equal(res[1].get_table()!.get_cell(0, 0), "426583");
});

test("ETCBC4: OBJECT TYPES y FEATURES (typeinfo)", skipNoCorpus, () => {
  const types = etcbc!.mql.exec("SELECT OBJECT TYPES GOqxqxqx")[0].get_table()!;
  const names = Array.from({ length: types.rows() }, (_, r) => types.get_cell(r, 0));
  for (const t of ["word", "clause_atom", "sentence", "verse", "book"]) assert.ok(names.includes(t));

  const feats = etcbc!.mql.exec("SELECT FEATURES FROM [word] GOqxqxqx")[0].get_table()!;
  assert.equal(feats.get_header(0), "FeatureName");
  const fnames = Array.from({ length: feats.rows() }, (_, r) => feats.get_cell(r, 0));
  assert.ok(fnames.includes("lex") && fnames.includes("sp"));
});

test("ETCBC4: find_monads con book enum por nombre y AND de ints", skipNoCorpus, () => {
  // Mod_askemdros::find_monads → SELECT ALL OBJECTS WHERE [chapter book=$book AND chapter=$chapter]
  const res = etcbc!.mql.exec("SELECT ALL OBJECTS WHERE [chapter book=Genesis AND chapter=1] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 1);
  const mo = res.get_first_straw().get_first_matched_object();
  assert.equal(mo.name, "chapter");
  assert.equal(mo.get_feature("book"), "Genesis");
  assert.equal(mo.get_feature("chapter"), "1");
  assert.equal(mo.get_monadset().low(), 1);
  assert.equal(mo.get_monadset().high2(), 673);
});

test("ETCBC4: parsePath anidado [book [chapter [verse]]]", skipNoCorpus, () => {
  // Mod_askemdros::parsePath — caminar con get_first_straw hasta el nivel más profundo
  const res = etcbc!.mql.exec("SELECT ALL OBJECTS WHERE [book book=Genesis [chapter chapter=1 [verse verse=1]]] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 1);
  const book = res.get_first_straw().get_first_matched_object();
  assert.equal(book.get_feature("book"), "Genesis");
  const chapter = book.get_sheaf()!.get_first_straw().get_first_matched_object();
  assert.equal(chapter.get_feature("chapter"), "1");
  const verse = chapter.get_sheaf()!.get_first_straw().get_first_matched_object();
  assert.equal(verse.get_feature("verse"), "1");
  assert.equal(verse.get_monadset().low(), 1);
  assert.equal(verse.get_monadset().high2(), 11); // Gn 1:1 = monads 1-11 ("1z:")
});

test("ETCBC4: GET OBJECTS HAVING MONADS IN {{n}} (BCV de quiz)", skipNoCorpus, () => {
  // Quiz_data::fetchBookLimit/getNextCandidate — Dictionary.php:376
  const res = etcbc!.mql.exec("GET OBJECTS HAVING MONADS IN {{42}} [verse GET verse] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 1);
  const mo = res.get_first_straw().get_first_matched_object();
  assert.equal(mo.get_id_d(), 135);
  assert.equal(mo.get_monadset().low(), 40);
  assert.equal(mo.get_monadset().high2(), 57);
  assert.equal(mo.get_feature("verse"), "4");
});

test("ETCBC4: IN {set} con features de word (surface + enum)", skipNoCorpus, () => {
  const res = etcbc!.mql.exec("SELECT ALL OBJECTS IN {1-100} WHERE [word GET lex,g_word_utf8] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 100);
  const mo = res.get_first_straw().get_first_matched_object();
  assert.equal(mo.get_id_d(), 5);
  assert.equal(mo.get_feature("lex"), "B");
  assert.equal(mo.get_feature("g_word_utf8"), "בְּ");
});

test("ETCBC4: predicado de enum por valor entero (sp=3)", skipNoCorpus, () => {
  // sp es enum en ETCBC4 (5=prep); Emdros casa tanto nombre como valor entero
  const res = etcbc!.mql.exec("SELECT ALL OBJECTS IN {1-60} WHERE [word GET lex,sp sp=prep] GOqxqxqx")[0].get_sheaf()!;
  assert.ok(res.number_of_straws() > 0);
  for (const s of res.get_straws()) {
    assert.equal(s.get_first_matched_object().get_feature("sp"), "prep");
  }
});

test("ETCBC4: quick_harvest devuelve solo monadsets", skipNoCorpus, () => {
  // Quiz_data::getCandidateSheaf — exec(..., true)
  const res = etcbc!.mql.exec("SELECT ALL OBJECTS IN {1-100} WHERE [sentence] GOqxqxqx", true)[0].get_sheaf()!;
  assert.ok(res.has_monadset());
  assert.equal(res.get_monadset()!.length, 18);
  assert.equal(res.get_monadset()![0].low(), 1);
  assert.equal(res.number_of_straws(), 0);
});

test("ETCBC4: Dictionary chain [clause GET typ [clause_atom GET code]]", skipNoCorpus, () => {
  const res = etcbc!.mql.exec("SELECT ALL OBJECTS IN {1-100} WHERE [clause GET typ [clause_atom GET code]] GOqxqxqx")[0].get_sheaf()!;
  assert.ok(res.number_of_straws() >= 1);
  const clause = res.get_first_straw().get_first_matched_object();
  assert.ok(clause.get_feature("typ") !== undefined);
  const atom = clause.get_sheaf()!.get_first_straw().get_first_matched_object();
  assert.equal(atom.name, "clause_atom");
  assert.ok(atom.get_feature("code") !== undefined);
});

test("ETCBC4: self y monad son features virtuales", skipNoCorpus, () => {
  const res = etcbc!.mql.exec("SELECT ALL OBJECTS IN {1-1} WHERE [word GET self,monad] GOqxqxqx")[0].get_sheaf()!;
  const mo = res.get_first_straw().get_first_matched_object();
  assert.equal(mo.get_feature("self"), String(mo.get_id_d()));
  assert.equal(mo.get_feature("monad"), "1");
});

test("ETCBC4: error de compilación para MQL inválido", skipNoCorpus, () => {
  assert.throws(() => etcbc!.mql.exec("SELECT ALL OBJECTS WHERE [word GET lex WHERE lex=1] GOqxqxqx"));
});

// ─────────────────────────────────────────────────────────────────────────────
// nestle1904 (sin last_monad/monads en word)
// ─────────────────────────────────────────────────────────────────────────────

test("nestle1904: Jn 1:1 con book enum numérico (book=4)", skipNoNestle, () => {
  const res = nestle!.mql.exec("SELECT ALL OBJECTS WHERE [verse book=4 AND chapter=1 AND verse=1 GET verse] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 1);
  const mo = res.get_first_straw().get_first_matched_object();
  assert.equal(mo.get_id_d(), 140958);
  assert.equal(mo.get_monadset().low(), 49033);
  assert.equal(mo.get_monadset().high2(), 49049);
  assert.equal(mo.get_feature("verse"), "1");
});

test("nestle1904: words de monad único y feature surface", skipNoNestle, () => {
  const res = nestle!.mql.exec("SELECT ALL OBJECTS IN {1-5} WHERE [word GET surface] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 5);
  assert.equal(res.get_first_straw().get_first_matched_object().get_feature("surface"), "Βίβλος");
});

test("nestle1904: GET OBJECTS HAVING MONADS IN {{1}} [book]", skipNoNestle, () => {
  const res = nestle!.mql.exec("GET OBJECTS HAVING MONADS IN {{1}} [book GET book] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 1);
  assert.equal(res.get_first_straw().get_first_matched_object().get_feature("book"), "Matthew");
});

// ─────────────────────────────────────────────────────────────────────────────
// jvulgate (versos multi-monad, mdf_ref TEXT)
// ─────────────────────────────────────────────────────────────────────────────

test("jvulgate: Jn 1:1 (versículo multi-monad 44899-44911)", skipNoJvulgate, () => {
  const res = jvulgate!.mql.exec("SELECT ALL OBJECTS WHERE [verse book=4 AND chapter=1 AND verse=1 GET verse] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 1);
  const mo = res.get_first_straw().get_first_matched_object();
  assert.equal(mo.get_id_d(), 125793);
  assert.equal(mo.get_monadset().low(), 44899);
  assert.equal(mo.get_monadset().high2(), 44911);
  assert.equal(mo.get_feature("verse"), "1");
});

test("jvulgate: mdf_ref inline TEXT se resuelve", skipNoJvulgate, () => {
  const res = jvulgate!.mql.exec("SELECT ALL OBJECTS WHERE [verse book=4 AND chapter=1 AND verse=1 GET ref] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 1);
  const mo = res.get_first_straw().get_first_matched_object();
  assert.equal(mo.get_feature("ref"), "JOHN 1.1");
});

test("jvulgate: GET OBJECTS HAVING MONADS IN {{1}} [book]", skipNoJvulgate, () => {
  const res = jvulgate!.mql.exec("GET OBJECTS HAVING MONADS IN {{1}} [book GET book] GOqxqxqx")[0].get_sheaf()!;
  assert.equal(res.number_of_straws(), 1);
  assert.equal(res.get_first_straw().get_first_matched_object().get_feature("book"), "Matthew");
});
