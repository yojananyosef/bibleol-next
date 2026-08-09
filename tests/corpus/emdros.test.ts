/**
 * open_emdros: gestor de corpora + consultas (fullUniverse, getMonadsAtLevel,
 * findMonads, dbAndBooks) — equivalentes de Mod_askemdros.
 * Solo se verifican si existe el corpus real.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  getEmdros,
  fullUniverse,
  getMonadsAtLevel,
  findMonads,
  dbAndBooks,
  shebanqLink,
  closeAllEmdros,
} from "../../src/lib/corpus/emdros.ts";
import { CORPUS_DIR, META_DIR } from "../../src/lib/db/sqlite.ts";

const hasEtcbc4 = existsSync(path.join(CORPUS_DIR, "ETCBC4"));
const skipNoCorpus = { skip: !hasEtcbc4 };

test("getEmdros: abre ETCBC4, esquema con word y jerarquía", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  assert.equal(h.prop, "ETCBC4");
  assert.equal(h.databaseName, "ETCBC4");
  assert.ok(h.emd.objectTypes.has("word"));
  assert.equal(h.dbconfig.bookorder.length, 39);
  assert.equal(h.dbconfig.typeinfo!.obj2feat.word.sp, "part_of_speech_t");
  assert.equal(getEmdros("ETCBC4"), h); // caché: mismo handle
});

test("fullUniverse: rango completo de monads", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const ms = fullUniverse(h);
  assert.ok(ms.low() >= 0);
  assert.ok(ms.high2() > 400000); // max_m del corpus ETCBC4
});

test("getMonadsAtLevel: colapsa por valor de feature (como el legacy)", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const books = getMonadsAtLevel(h, fullUniverse(h), 0);
  assert.equal(Object.keys(books).length, 39);
  assert.ok(books.Genesis.size() > 1000);
  const chapters = getMonadsAtLevel(h, fullUniverse(h), 1);
  assert.equal(Object.keys(chapters).length, 150); // 1..150 (Salmos)
  assert.ok(chapters["1"].size() > 100); // 2Cr 1 (último capítulo "1")
  const verses = getMonadsAtLevel(h, fullUniverse(h), 2);
  assert.equal(Object.keys(verses).length, 176); // 1..176 (Sal 119)
  assert.ok(verses["1"].size() > 0);
});

test("findMonads: Gn 1:1-3 y capítulo entero", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const v1_3 = findMonads(h, "Genesis", 1, 1, 3);
  assert.equal(v1_3.size(), 39); // monads 1-39
  const ch1 = findMonads(h, "Genesis", 1, 0, 0);
  assert.equal(ch1.size(), 673);
  assert.throws(() => findMonads(h, "Genesis", 1, 900, 910), /no_text_found/);
});

test("dbAndBooks: orden ETCBC4 primero, descripción localizada", { skip: !existsSync(META_DIR) }, () => {
  const books = dbAndBooks("en");
  assert.deepEqual(
    books.map((b) => b.name),
    ["ETCBC4", "ETCBC4-translit", "nestle1904", "jvulgate"],
  );
  const etcbc4 = books[0];
  assert.equal(etcbc4.databaseName, "ETCBC4");
  assert.ok(etcbc4.loc_desc.length > 0);
  assert.equal(etcbc4.loc_books.Genesis, "Genesis");
  assert.deepEqual(etcbc4.order[0], ["Genesis", "1-50"]);
  const vulgate = books.find((b) => b.name === "jvulgate")!;
  assert.equal(vulgate.order.length, 27);
});

test("shebanqLink: solo corpora hebreos", () => {
  assert.ok(shebanqLink("ETCBC4", "Genesis", 1)?.includes("shebanq"));
  assert.ok(shebanqLink("ETCBC4-translit", "Genesis", 1));
  assert.equal(shebanqLink("nestle1904", "Matthew", 1), null);
});

test("closeAllEmdros: cierra sin errores", skipNoCorpus, () => {
  closeAllEmdros();
  const h = getEmdros("ETCBC4"); // se reabre
  assert.ok(h.emd.objectTypes.has("word"));
  closeAllEmdros();
});
