/**
 * Reader: port del sentencegrammar del cliente (walkers) + tabla de
 * información gramatical (toolTipFunc) contra datos reales de ETCBC4.
 * Solo se verifican si existe el corpus real.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { getEmdros, findMonads } from "../../src/lib/corpus/emdros.ts";
import { Dictionary } from "../../src/lib/corpus/dictionary.ts";
import type { Dbinfo } from "../../src/lib/corpus/db-config.ts";
import { META_DIR, CORPUS_DIR } from "../../src/lib/db/sqlite.ts";
import {
  enhanceSentenceGrammar,
  getSentenceGrammarFor,
  type ReaderL10n,
  type ReaderTypeInfo,
} from "../../src/lib/reader/sentencegrammar.ts";
import { grammarInfoTable } from "../../src/lib/reader/grammar-info.ts";

const WHATNAME = ["feature", "metafeature", "groupstart", "groupend"];

const skip = { skip: !existsSync(CORPUS_DIR) || !existsSync(META_DIR) };

/** Carga corpus + localización ETCBC4 en (igual que DbConfig initConfig). */
function setup() {
  const h = getEmdros("ETCBC4");
  h.dbconfig.initConfig("ETCBC4", "ETCBC4", "en");
  const dbinfo = JSON.parse(h.dbconfig.dbinfo_json) as Dbinfo & {
    sentencegrammar: { mytype: string; objType: string; items?: { mytype: string; name?: string; items?: unknown[] }[] }[];
    objectSettings: Record<string, { featuresetting?: Record<string, { foreignText?: boolean; transliteratedText?: boolean }> }>;
    objHasSurface: string;
    surfaceFeature: string;
  };
  const l10n = JSON.parse(h.dbconfig.l10n_json) as ReaderL10n;
  const typeinfo = JSON.parse(h.dbconfig.typeinfo_json) as ReaderTypeInfo;
  return { h, dbinfo, l10n, typeinfo };
}

test("reader: enhanceSentenceGrammar y getSentenceGrammarFor (ETCBC4)", skip, () => {
  const { dbinfo, l10n } = setup();
  const grammar = enhanceSentenceGrammar(dbinfo.sentencegrammar as never);
  assert.equal(grammar.length, 4);
  assert.deepEqual(grammar.map((g) => g.objType), ["word", "phrase", "clause", "sentence"]);

  const wg = getSentenceGrammarFor(grammar, "word");
  assert.ok(wg !== null);
  assert.equal(wg.objType, "word");

  // walkFeatureNames: secuencia groupstart/feature/metafeature con nombres localizados
  const seen: string[] = [];
  wg.walkFeatureNames("word", l10n, (whattype, _o, _oo, featName, featNameLoc) => {
    seen.push(`${WHATNAME[whattype]}:${featName}=${featNameLoc ?? ""}`);
  });
  assert.ok(seen.some((s) => s.startsWith("groupstart:form_in_text=Form in text")));
  assert.ok(seen.some((s) => s.startsWith("feature:g_lex_utf8=Lexical stem")));
  assert.ok(seen.some((s) => s.startsWith("metafeature:pgn=Person, gender, number")));
  // Los subfeatures no producen filas propias
  assert.ok(!seen.some((s) => s.startsWith("feature:p1")));
});

test("reader: grammarInfoTable de una palabra de Gn 1:1 (paridad toolTipFunc)", skip, () => {
  const { h, dbinfo, l10n, typeinfo } = setup();
  const ms = findMonads(h, "Genesis", 1, 1, 1);
  const dict = new Dictionary(
    { msets: [ms], inQuiz: false, showIcons: false },
    { mql: h.mql, dbinfo, l10nJson: h.dbconfig.l10n_json },
  );
  const j = dict.toJSON();
  const words = j.monadObjects[0][0].objects;

  const grammar = enhanceSentenceGrammar(dbinfo.sentencegrammar as never);
  const wg = getSentenceGrammarFor(grammar, "word")!;

  const w1 = words.find((o) => o.monads === "{ 1-1 }");
  assert.ok(w1 !== undefined);
  const info = grammarInfoTable(
    wg,
    w1.features ?? {},
    l10n,
    typeinfo,
    dbinfo,
    { setHead: true, hideWord: false },
  );

  // Cabecera: nombre localizado del tipo de objeto
  assert.equal(info.heading, "Word");
  assert.equal(info.rows[0].kind, "head");
  assert.equal(info.rows[0].value, "Word");

  // Fila visual con el texto de la palabra (surface feature, sin sufijo)
  const visual = info.rows.find((r) => r.kind === "visual");
  assert.ok(visual);
  assert.equal(visual.value, "בְּ");

  // Grupos localizados
  const groups = info.rows.filter((r) => r.kind === "groupstart").map((r) => r.label);
  assert.ok(groups.includes("Form in text"));
  assert.ok(groups.includes("Lexeme"));
  assert.ok(groups.includes("Morphology"));
  assert.ok(groups.includes("Glosses"));

  // sp localizado (preposición)
  const sp = info.rows.find((r) => r.kind === "feature" && r.label === "Part of speech");
  assert.ok(sp);
  assert.equal(sp.value, "Preposition");

  // Metafeature pgn no vacía (no se muestra la fila de valores crudos)
  const pgn = info.rows.find((r) => r.kind === "metafeature" && r.label === "Person, gender, number");
  assert.ok(pgn);
  assert.ok(pgn.value.length > 0);
  assert.ok(!info.rows.some((r) => r.kind === "feature" && r.label === "p1"));

  // Glosa en inglés
  const gloss = info.rows.find((r) => r.kind === "feature" && r.label === "English");
  assert.ok(gloss);
  assert.ok(gloss.value.length > 0);
});

test("reader: la 2ª palabra de Gn 1:1 es sustantivo (sp), con vocal/translit", skip, () => {
  const { h, dbinfo, l10n, typeinfo } = setup();
  const ms = findMonads(h, "Genesis", 1, 1, 1);
  const dict = new Dictionary(
    { msets: [ms], inQuiz: false, showIcons: false },
    { mql: h.mql, dbinfo, l10nJson: h.dbconfig.l10n_json },
  );
  const j = dict.toJSON();
  const grammar = enhanceSentenceGrammar(dbinfo.sentencegrammar as never);
  const wg = getSentenceGrammarFor(grammar, "word")!;

  const w2 = j.monadObjects[0][0].objects.find((o) => o.monads === "{ 2-2 }")!;
  const info = grammarInfoTable(
    wg,
    w2.features ?? {},
    l10n,
    typeinfo,
    dbinfo,
    { setHead: false, hideWord: false },
  );

  const sp = info.rows.find((r) => r.kind === "feature" && r.label === "Part of speech");
  assert.equal(sp?.value, "Noun");

  const visual = info.rows.find((r) => r.kind === "visual");
  assert.equal(visual?.value, "רֵאשִׁ֖ית");

  // g_word_translit se muestra tal cual (ascii)
  const translit = info.rows.find((r) => r.kind === "feature" && r.label === "Transliteration");
  assert.equal(translit?.value, "rēˀšît");
});
