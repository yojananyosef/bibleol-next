/**
 * Dictionary: port de Dictionary.php — jerarquía de niveles (word→phrase→
 * clause→sentence→patriarch), indirectLookup (gloss/hint), bcv y visual.
 * Solo se verifican si existe el corpus real.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getEmdros, findMonads, closeAllEmdros } from "../../src/lib/corpus/emdros.ts";
import { Dictionary } from "../../src/lib/corpus/dictionary.ts";
import { SingleMonadObject, MultipleMonadObject } from "../../src/lib/corpus/monadobject.ts";
import { OlMonadSet } from "../../src/lib/corpus/monads.ts";
import { closeIndirectDbs } from "../../src/lib/corpus/lexicon.ts";
import { CORPUS_DIR, DATA_DIR } from "../../src/lib/db/sqlite.ts";

const hasEtcbc4 = existsSync(path.join(CORPUS_DIR, "ETCBC4"));
const skipNoCorpus = { skip: !hasEtcbc4 };

function makeDict(h: ReturnType<typeof getEmdros>, ms: OlMonadSet, opts: { showIcons?: boolean; glosslimit?: number } = {}) {
  // El dbconfig del handle se re-inicializa para la lengua del usuario
  h.dbconfig.initConfig("ETCBC4", "ETCBC4", "en");
  return new Dictionary(
    { msets: [ms], inQuiz: false, showIcons: opts.showIcons ?? false, glosslimit: opts.glosslimit },
    {
      mql: h.mql,
      dbinfo: JSON.parse(h.dbconfig.dbinfo_json),
      l10nJson: h.dbconfig.l10n_json,
    },
  );
}

test("Dictionary: Gn 1:1-3 completa la frase (39 monads) y fija el libro", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const ms = findMonads(h, "Genesis", 1, 1, 3);
  const d = makeDict(h, ms);
  assert.equal(d.sentenceSets.length, 1);
  assert.equal(d.sentenceSets[0].size(), 39);
  assert.equal(d.bookTitle, "Genesis");
  assert.equal(d.get_book_title(), "Genesis");
  closeAllEmdros();
  closeIndirectDbs();
});

test("Dictionary: nivel 0 son 39 palabras con text, suffix, bcv y bcv_loc", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const ms = findMonads(h, "Genesis", 1, 1, 3);
  const d = makeDict(h, ms);

  const words = d.monadObjects[0][0];
  assert.equal(words.length, 39);
  for (const w of words) assert.ok(w instanceof SingleMonadObject);

  const first = words[0] as SingleMonadObject;
  // ETCBC4 segmenta "בראשית" como בְּ + רֵאשִׁית
  assert.equal(first.get_text(), "בְּ");
  assert.equal(first.get_suffix(), "");
  assert.deepEqual(first.get_bcv(), ["Genesis", 1, 1]);
  assert.equal(first.bcv_loc, "Gen 1:1");

  // último versículo del pasaje
  const last = words[38] as SingleMonadObject;
  assert.equal(last.get_bcv()[2], 3);

  assert.equal(d.getVisual(1), "בְּ");
  closeAllEmdros();
  closeIndirectDbs();
});

test("Dictionary: indirectLookup — gloss 'english' en las palabras", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const ms = findMonads(h, "Genesis", 1, 1, 3);
  const d = makeDict(h, ms);

  const words = d.monadObjects[0][0];
  const first = words[0] as SingleMonadObject;
  const gloss = first.get_feature("english");
  assert.ok(typeof gloss === "string");
  assert.notEqual(gloss, "*");
  assert.notEqual(gloss, "");

  // El gloss debe coincidir con el de data/lexicons.db
  const expected = expectedGloss(first.get_feature("lex") ?? "", first.get_feature("vs") ?? "");
  assert.equal(gloss, expected);
  closeAllEmdros();
  closeIndirectDbs();
});

test("Dictionary: jerarquía — cada palabra tiene padre y todo cuelga del patriarch", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const ms = findMonads(h, "Genesis", 1, 1, 3);
  const d = makeDict(h, ms);

  // maxLevels = 4 niveles (word/phrase/clause/sentence) + patriarch
  assert.equal(d.monadObjects[0].length, 5);

  const words = d.monadObjects[0][0];
  for (const w of words) assert.ok(w.get_parent() !== null, "palabra sin padre");

  const level1 = d.monadObjects[0][1];
  assert.ok(level1.length > 0);
  for (const m of level1) assert.ok(m instanceof MultipleMonadObject);

  // Todos los hijos del nivel 1 cubren las 39 palabras
  const childIds = new Set<number>();
  for (const p of level1) for (const cid of p.children_idds ?? []) childIds.add(cid);
  assert.equal(childIds.size, 39);

  // El patriarch es el único objeto del último nivel y es padre de todo
  const patriarch = d.monadObjects[0][4];
  assert.equal(patriarch.length, 1);
  assert.equal(patriarch[0].get_id_d(), -1);
  assert.equal(patriarch[0].get_parent(), null);
  assert.ok((patriarch[0].children_idds?.length ?? 0) > 0);

  // El árbol completo conecta: del patriarch a cada palabra
  const topChildren = new Set(patriarch[0].children_idds);
  const level3 = d.monadObjects[0][3];
  assert.ok(level3.every((m) => topChildren.has(m.get_id_d())));
  closeAllEmdros();
  closeIndirectDbs();
});

test("Dictionary: glosslimit oculta glosses frecuentes (quiz)", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const ms = findMonads(h, "Genesis", 1, 1, 3);
  const d = makeDict(h, ms, { glosslimit: 5 });

  const words = d.monadObjects[0][0];
  const first = words[0] as SingleMonadObject;
  const rank = parseInt(first.get_feature("frequency_rank") ?? "0", 10);
  const gloss = first.get_feature("english") ?? "";
  if (rank <= 5) assert.equal(gloss, "&#x26d4;");
  else assert.notEqual(gloss, "&#x26d4;");
  closeAllEmdros();
  closeIndirectDbs();
});

test("Dictionary: toJSON serializa la jerarquía para el cliente", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  const ms = findMonads(h, "Genesis", 1, 1, 3);
  const d = makeDict(h, ms);

  const j = d.toJSON();
  assert.equal(j.bookTitle, "Genesis");
  assert.equal(j.sentenceSets.length, 1);
  assert.equal(j.monadObjects.length, 1); // un conjunto de frases
  assert.equal(j.monadObjects[0].length, 5);
  assert.equal(j.monadObjects[0][0].level, 0);
  assert.equal(j.monadObjects[0][0].objects.length, 39);
  const w0 = j.monadObjects[0][0].objects[0];
  assert.equal(w0.kind, "single");
  assert.equal(w0.text, "בְּ");
  assert.equal(w0.bcv_loc, "Gen 1:1");
  assert.equal(w0.monads, "{ 1-1 }");
  const pat = j.monadObjects[0][4].objects[0];
  assert.equal(pat.id_d, -1);
  assert.equal(pat.name, "Patriarch");
  closeAllEmdros();
  closeIndirectDbs();
});

/** Consulta directa a data/lexicons.db: el gloss que el legacy devolvería. */
function expectedGloss(lex: string, vs: string): string {
  const db = new Database(path.join(DATA_DIR, "lexicons.db"), { readonly: true });
  const row = db
    .prepare(
      "SELECT gloss FROM lexicon_Hebrew h JOIN lexicon_Hebrew_en lang ON lang.lex_id=h.id WHERE lex=? AND vs=?",
    )
    .get(lex, vs) as { gloss: string } | undefined;
  db.close();
  return row?.gloss ?? "*";
}
