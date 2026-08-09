/**
 * Display tree: port de la jerarquía DisplayMonadObject (dictionary.ts +
 * displaymonadobject.ts) — segmentos, hasp/hass, dummy, labels gram,
 * features por nodo (walkFeatureValues) y wordgrammar.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { enhanceSentenceGrammar, type ReaderL10n, type ReaderObjectSettings, type ReaderTypeInfo } from "../../src/lib/reader/sentencegrammar.ts";
import { buildDisplayTree, buildGrammarPanel, segments, firstGlossOnly, indentationIndicator, type DisplayTree, type DisplayBox, type DisplayWord } from "../../src/lib/reader/display.ts";
import { makeCharset } from "../../src/lib/reader/charset.ts";
import type { MonadObjectJSON } from "../../src/lib/corpus/dictionary.ts";
import { CORPUS_DIR, META_DIR } from "../../src/lib/db/sqlite.ts";
import { getEmdros, findMonads } from "../../src/lib/corpus/emdros.ts";
import { Dictionary } from "../../src/lib/corpus/dictionary.ts";

const hasEtcbc4 = existsSync(path.join(CORPUS_DIR, "ETCBC4"));
const skipNoCorpus = { skip: !hasEtcbc4 || !existsSync(META_DIR) };

// ─────────────────────────────────────────────────────────────────────────────
// Datos sintéticos estilo ETCBC4
// ─────────────────────────────────────────────────────────────────────────────

const l10n: ReaderL10n = {
  emdrosobject: {
    word: { _objname: "Word", g_lex_utf8: "Lexeme", g_word_translit: "Transliteration", english: "Gloss" },
    word_abbrev: { _objname: "W" },
    phrase: { _objname: "Phrase", typ: "Type", function: "Function", det: "Determiner", rela: "Relation" },
    clause: { _objname: "Clause", typ: "Type", kind: "Kind", rela: "Relation", txt: "Text", domain: "Domain" },
    clause_atom: { _objname: "Clause atom", tab: "Tab", code: "Code", code_TYPE_text: "Code text", code_TYPE_text_VALUES: [
      { first: 0, last: 0, text: "No relation" },
      { first: 100, last: 167, text: "No conj." },
      { first: 300, last: 367, text: "Conj.adv." },
    ] as unknown as string },
    sentence: { _objname: "Sentence" },
  },
  emdrostype: {
    phrase_typ_abbrev: { D: "DP", N: "NP" },
    clause_kind_abbrev: { WQ: "WQ" },
    clause_typ: { Cl: "Clause" },
    clause_kind: { WQ: "Wh-question" },
    clause_rela: { x: "no relation" },
  },
  grammargroup: { word: { glosses: "Glosses" } },
  grammarmetafeature: { word: { pgn: "Person, gender, number" } },
  grammarsubfeature: {
    word: { pgn: { "3m": "3rdm", "3f": "3rdf" }, p: { "3": "3rd" }, g: { m: "m" }, n: { s: "sg", p: "pl" } },
  },
};

const sentencegrammarJson = [
  {
    mytype: "SentenceGrammar",
    objType: "word",
    items: [
      { mytype: "GrammarFeature", name: "g_word_translit" },
      { mytype: "GrammarFeature", name: "g_lex_utf8" },
      { mytype: "GrammarGroup", name: "glosses", items: [{ mytype: "GrammarFeature", name: "english" }] },
      { mytype: "GrammarMetaFeature", name: "pgn", items: [
        { mytype: "GrammarSubFeature", name: "p" },
        { mytype: "GrammarSubFeature", name: "g" },
        { mytype: "GrammarSubFeature", name: "n" },
      ] },
      { mytype: "GrammarFeature", name: "frequency_rank" },
    ],
  },
  {
    mytype: "SentenceGrammar",
    objType: "phrase",
    items: [
      { mytype: "GrammarFeature", name: "typ" },
      { mytype: "GrammarFeature", name: "function" },
      { mytype: "GrammarFeature", name: "det" },
      { mytype: "GrammarFeature", name: "rela" },
    ],
  },
  {
    mytype: "SentenceGrammar",
    objType: "clause",
    items: [
      { mytype: "GrammarFeature", name: "typ" },
      { mytype: "GrammarFeature", name: "kind" },
      { mytype: "GrammarFeature", name: "rela" },
      { mytype: "GrammarFeature", name: "txt" },
      { mytype: "GrammarFeature", name: "domain" },
      { mytype: "GrammarFeature", name: "clause_atom:tab" },
      { mytype: "GrammarFeature", name: "clause_atom:code_TYPE_text" },
      { mytype: "GrammarFeature", name: "clause_atom:code" },
    ],
  },
  { mytype: "SentenceGrammar", objType: "sentence", items: [] },
];

const objectSettings: ReaderObjectSettings = {
  word: {
    featuresetting: {
      g_word_translit: { transliteratedText: true },
      g_lex_utf8: { foreignText: true },
      english: { isGloss: true, fontsize: "tenpoint" },
      pgn: {},
      frequency_rank: { ignoreShow: true, isRange: true },
    },
  },
  phrase: { featuresetting: { typ: {}, function: {}, det: {}, rela: {} } },
  clause: { featuresetting: { typ: {}, kind: {}, rela: {}, txt: {}, domain: {}, "clause_atom:tab": {}, "clause_atom:code_TYPE_text": {}, "clause_atom:code": {} } },
  sentence: { featuresetting: {} },
};

const typeinfo = {
  obj2feat: {
    word: { g_word_translit: "string", g_lex_utf8: "string", english: "string", pgn: "pgn", frequency_rank: "integer" },
    phrase: { typ: "phrase_typ", function: "function", det: "phrase_determination_t", rela: "rela" },
    clause: { typ: "clause_typ", kind: "clause_kind", rela: "clause_rela", txt: "string", domain: "string" },
    clause_atom: { tab: "integer", code: "code", code_TYPE_text: "code_TYPE_text" },
    sentence: {},
  },
};

interface WordSpec {
  monad: number;
  text: string;
  suffix: string;
  verse: number;
  sameAsPrev: boolean[];
  features: Record<string, string>;
}

function dictFromSpecs(words: WordSpec[]): { monadObjects: { level: number; objects: MonadObjectJSON[] }[] } {
  const wordObjects = words.map((w) => ({
    kind: "single" as const,
    id_d: 1000 + w.monad,
    name: "word",
    monads: `{ ${w.monad} }`,
    features: w.features,
    children_idds: null,
    text: w.text,
    suffix: w.suffix,
    bcv: [1, 1, w.verse],
    sameAsPrev: w.sameAsPrev,
  }));
  return { monadObjects: [{ level: 0, objects: wordObjects }, { level: 1, objects: [] }, { level: 2, objects: [] }, { level: 3, objects: [] }, { level: 4, objects: [] }] };
}

function opts() {
  return {
    grammar: enhanceSentenceGrammar(sentencegrammarJson as never),
    l10n,
    typeinfo,
    objectSettings,
    charset: makeCharset("hebrew"),
    databaseName: "ETCBC4",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers sintéticos
// ─────────────────────────────────────────────────────────────────────────────

function leaves(root: DisplayBox): DisplayWord[] {
  const out: DisplayWord[] = [];
  const walk = (b: DisplayBox) => {
    for (const c of b.children) {
      if (c.kind === "word") out.push(c);
      else walk(c);
    }
  };
  walk(root);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

test("segments: parsea rangos y monads sueltos", () => {
  assert.deepEqual(segments("{ 1-39 }"), [[1, 39]]);
  assert.deepEqual(segments("{ 1-2, 5-7 }"), [[1, 2], [5, 7]]);
  assert.deepEqual(segments("{ 5 }"), [[5, 5]]);
  assert.deepEqual(segments("{ -3--1 }"), [[-3, -1]]);
});

test("firstGlossOnly: recorta el gloss en la primera ',' ';' o '('", () => {
  assert.equal(firstGlossOnly("in the beginning, first"), "in the beginning");
  assert.equal(firstGlossOnly("a; b"), "a");
  // El legacy conserva el espacio previo al '(' (regex ([^,;(]+))
  assert.equal(firstGlossOnly("say (Qal)"), "say ");
  assert.equal(firstGlossOnly("simple"), "simple");
});

test("indentationIndicator: números, espacios y cuadrados", () => {
  assert.equal(indentationIndicator(1, 1, 3), "1\u25aa\u25aa\u25aa\u00a0\u00a0");
  assert.equal(indentationIndicator(3, 1, 3), "\u00a0\u00a03\u25aa\u00a0\u00a0");
  assert.equal(indentationIndicator(10, 1, 12), "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a010\u25aa\u25aa\u25aa\u00a0\u00a0");
});

test("árbol sintético: jerarquía, hasp/hass, dummy y verse", () => {
  const dict = dictFromSpecs([
    { monad: 1, text: "ב", suffix: "", verse: 1, sameAsPrev: [true, true, false], features: { g_lex_utf8: "a" } },
    { monad: 2, text: "ד", suffix: "", verse: 1, sameAsPrev: [true, true, true], features: { g_lex_utf8: "b" } },
    { monad: 3, text: "ב", suffix: "-", verse: 2, sameAsPrev: [true, false, false], features: { g_lex_utf8: "c" } },
    { monad: 5, text: "ה", suffix: " ", verse: 2, sameAsPrev: [false, false, true], features: { g_lex_utf8: "d" } },
    { monad: 6, text: "ו", suffix: "", verse: 2, sameAsPrev: [false, false, true], features: { g_lex_utf8: "e" } },
  ]);

  // phrase 1: monads 1-2; dummy phrase para el monad 3; phrase 2: monads 5-6
  dict.monadObjects[1].objects = [
    { kind: "multiple", id_d: 2001, name: "phrase", monads: "{ 1-2 }", features: { typ: "D", function: "S", det: "", rela: "x" }, children_idds: [1001, 1002] },
    { kind: "multiple", id_d: 2999, name: "dummy", monads: "{ 3 }", features: null, children_idds: [1003] },
    { kind: "multiple", id_d: 2002, name: "phrase", monads: "{ 5-6 }", features: { typ: "N", function: "Subj", det: "D", rela: "" }, children_idds: [1005, 1006] },
  ];
  // cláusula dividida en dos segmentos (gap en el monad 4)
  dict.monadObjects[2].objects = [
    {
      kind: "multiple",
      id_d: 3001,
      name: "clause",
      monads: "{ 1-2, 5-6 }",
      features: { typ: "Cl", kind: "WQ", rela: "x", txt: "", domain: "book" },
      subobjects: [{ tab: "1", code: "0" }, { tab: "3", code: "300" }],
      children_idds: [2001, 2002],
    },
    // constructHierarchy crea un dummy por nivel para los huérfanos (monad 3)
    { kind: "multiple", id_d: 3999, name: "dummy", monads: "{ 3 }", features: null, children_idds: [2999] },
  ];
  dict.monadObjects[3].objects = [
    { kind: "multiple", id_d: 4001, name: "sentence", monads: "{ 1-6 }", features: {}, children_idds: [3001, 3999] },
  ];
  dict.monadObjects[4].objects = [
    { kind: "multiple", id_d: -1, name: "Patriarch", monads: "{ 1-6 }", features: null, children_idds: [4001] },
  ];

  const t: DisplayTree = buildDisplayTree(dict, opts());

  assert.equal(t.root.level, 4);
  assert.equal(t.root.objType, "Patriarch");
  assert.equal(t.root.children.length, 1);

  const sent = t.root.children[0] as DisplayBox;
  assert.equal(sent.level, 3);
  assert.equal(sent.shortName, "Sentence");

  // La cláusula se divide en dos segmentos; el dummy del monad 3 (cláusula
  // dummy en el nivel 2) queda entre ambos en orden de monads
  assert.equal(sent.children.length, 3);
  const seg0 = sent.children[0] as DisplayBox;
  const dummyClause = sent.children[1] as DisplayBox;
  const seg1 = sent.children[2] as DisplayBox;
  assert.equal(seg0.level, 2);
  assert.equal(seg0.mix, 0);
  assert.equal(seg0.hasp, false);
  assert.equal(seg0.hass, true);
  assert.equal(seg1.hasp, true);
  assert.equal(seg1.hass, false);
  assert.equal(seg0.idd, 3001);
  assert.equal(seg0.indent, 1);
  assert.equal(seg1.indent, 3);
  assert.equal(dummyClause.dummy, true);
  assert.equal(dummyClause.lo, 3);

  // clause_atom:tab no aparece en la lista de features; las demás sí (abbrev)
  const grammar = seg0.grammar;
  assert.deepEqual(grammar.map((g) => g.featName), ["typ", "kind", "rela", "txt", "domain", "code_TYPE_text", "code"]);
  assert.deepEqual(grammar.map((g) => g.value), ["Clause", "WQ", "no relation", "-", "book", "No relation", "0"]);
  assert.equal(seg1.grammar.find((g) => g.featName === "code_TYPE_text")?.value, "Conj.adv.");

  // Frases: ph1 y ph2 reales; shortName con abbrev
  const ph1 = seg0.children[0] as DisplayBox;
  const ph2 = seg1.children[0] as DisplayBox;
  assert.equal(ph1.level, 1);
  assert.equal(ph1.shortName, "Phrase");
  assert.equal(ph1.grammar[0].value, "DP"); // phrase_typ_abbrev
  assert.equal(ph1.grammar[2].value, ""); // det vacío (tipo no-string → sin "-")
  assert.equal(ph2.idd, 2002);
  // La dummy del monad 3 cuelga de la cláusula dummy
  const dummyPhrase = dummyClause.children[0] as DisplayBox;
  assert.equal(dummyPhrase.dummy, true);
  assert.equal(dummyPhrase.idd, 2999);
  assert.equal(dummyPhrase.children.length, 1);

  // Palabras: verse y cont
  const words = leaves(t.root).sort((a, b) => a.monad - b.monad);
  assert.equal(words.length, 5);
  assert.deepEqual(words.map((w) => w.verse), [1, null, 2, null, null]);
  assert.deepEqual(words.map((w) => w.cont), ["cont", "cont", "contx", null, "cont"]);
  assert.equal(words[0].text, "ב");
  assert.equal(words[2].text, "ב-");
});

test("árbol sintético: wordgrammar (clases, gloss recortado, metafeature)", () => {
  const dict = dictFromSpecs([
    {
      monad: 1,
      text: "ב",
      suffix: " ",
      verse: 1,
      sameAsPrev: [true, true, false],
      features: {
        g_word_translit: "bereshit",
        g_lex_utf8: "רֵאשִׁית",
        english: "beginning, first (of)",
        p: "3", g: "m", n: "s",
        frequency_rank: "7",
      },
    },
  ]);
  dict.monadObjects[1].objects = [
    { kind: "multiple", id_d: 2001, name: "phrase", monads: "{ 1 }", features: {}, children_idds: [1001] },
  ];
  dict.monadObjects[2].objects = [
    { kind: "multiple", id_d: 3001, name: "clause", monads: "{ 1 }", features: {}, subobjects: [{ tab: "0", code: "0" }], children_idds: [2001] },
  ];
  dict.monadObjects[3].objects = [
    { kind: "multiple", id_d: 4001, name: "sentence", monads: "{ 1 }", features: {}, children_idds: [3001] },
  ];
  dict.monadObjects[4].objects = [
    { kind: "multiple", id_d: -1, name: "Patriarch", monads: "{ 1 }", features: null, children_idds: [4001] },
  ];

  const t = buildDisplayTree(dict, opts());
  const w = leaves(t.root)[0];

  assert.deepEqual(w.wordgrammar.map((g) => g.featName), ["g_word_translit", "g_lex_utf8", "english", "pgn", "frequency_rank"]);
  assert.equal(w.wordgrammar[0].value, "bereshit");
  assert.equal(w.wordgrammar[0].wordclass, "hebrew_translit");
  assert.equal(w.wordgrammar[1].value, "רֵאשִׁית");
  assert.equal(w.wordgrammar[1].wordclass, "hebrew");
  assert.equal(w.wordgrammar[2].value, "beginning"); // gloss recortado
  assert.equal(w.wordgrammar[2].wordclass, "tenpoint ltr");
  assert.equal(w.wordgrammar[3].value, "3rdmsg"); // metafeature pgn = p+g+n
  assert.equal(w.wordgrammar[3].wordclass, "ltr");
  assert.equal(w.wordgrammar[4].value, "7");
  assert.equal(w.frequencyRank, 7);
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel de selección de gramática
// ─────────────────────────────────────────────────────────────────────────────

test("buildGrammarPanel: niveles, init boxes, grupos e implicit", () => {
  const panel = buildGrammarPanel(enhanceSentenceGrammar(sentencegrammarJson as never), l10n, makeCharset("hebrew"), "ETCBC4");

  assert.equal(panel.length, 4);
  assert.deepEqual(panel.map((p) => p.objName), ["Word", "Phrase", "Clause", "Sentence"]);

  // Nivel 0 (palabras, hebreo): ws_cb + features agrupadas
  assert.deepEqual(panel[0].init, [{ id: "ws_cb", label: "Word spacing", kind: "wordspace", level: 0 }]);
  assert.deepEqual(panel[0].groups.map((g) => g.name), [null, "Glosses", null]);
  const wordFeatures = panel[0].groups.flatMap((g) => g.features);
  assert.deepEqual(wordFeatures.map((f) => f.checkboxId), [
    "word_g_word_translit_cb",
    "word_g_lex_utf8_cb",
    "word_english_cb",
    "word_pgn_cb",
    "word_frequency_rank_cb",
  ]);
  assert.deepEqual(wordFeatures.map((f) => f.dispKey), ["g_word_translit", "g_lex_utf8", "english", "pgn", "frequency_rank"]);
  assert.ok(wordFeatures.every((f) => f.implicit === "wordspace"));
  assert.equal(panel[0].groups[1].hasFrequency, false);
  assert.equal(panel[0].groups[2].hasFrequency, true);

  // Niveles 1 y 2: checkboxes "separate lines" y "show border"
  assert.deepEqual(panel[1].init.map((b) => b.id), ["lev1_seplin_cb", "lev1_sb_cb"]);
  assert.deepEqual(panel[2].init.map((b) => b.id), ["lev2_seplin_cb", "lev2_sb_cb"]);
  // El último nivel (sentence/Patriarch) no tiene checkboxes de inicio
  assert.deepEqual(panel[3].init, []);

  // Nivel 2 (cláusula): sin grupos; clause_atom:tab es "seplin", el resto "border"
  const clauseFeatures = panel[2].groups.flatMap((g) => g.features);
  assert.equal(panel[2].groups.length, 1);
  assert.deepEqual(clauseFeatures.map((f) => f.checkboxId), [
    "clause_typ_cb",
    "clause_kind_cb",
    "clause_rela_cb",
    "clause_txt_cb",
    "clause_domain_cb",
    "clause_atom_tab_cb",
    "clause_atom_code_TYPE_text_cb",
    "clause_atom_code_cb",
  ]);
  const tab = clauseFeatures.find((f) => f.checkboxId === "clause_atom_tab_cb");
  assert.ok(tab);
  assert.equal(tab?.implicit, "seplin");
  assert.equal(tab?.dispKey, "clause_atom_tab");
  assert.ok(clauseFeatures.filter((f) => f.implicit === "border").length >= 5);

  // Sin hebreo → sin ws_cb; fuera de ETCBC4 el tab es una feature normal
  const latinPanel = buildGrammarPanel(enhanceSentenceGrammar(sentencegrammarJson as never), l10n, makeCharset("latin"), "ETCBC4");
  assert.deepEqual(latinPanel[0].init, []);
  const greekPanel = buildGrammarPanel(enhanceSentenceGrammar(sentencegrammarJson as never), l10n, makeCharset("hebrew"), "nestle1904");
  const tab2 = greekPanel[2].groups.flatMap((g) => g.features).find((f) => f.checkboxId === "clause_atom_tab_cb");
  assert.equal(tab2?.implicit, "border");
});

// ─────────────────────────────────────────────────────────────────────────────
// Corpus real
// ─────────────────────────────────────────────────────────────────────────────

test("Gn 1:1 (ETCBC4): árbol de display con 7 palabras y jerarquía completa", skipNoCorpus, () => {
  const h = getEmdros("ETCBC4");
  h.dbconfig.initConfig("ETCBC4", "ETCBC4", "en");
  const dbinfo = JSON.parse(h.dbconfig.dbinfo_json) as {
    sentencegrammar: never[];
    objectSettings: ReaderObjectSettings;
    charSet: string;
  };
  const l10n = JSON.parse(h.dbconfig.l10n_json) as ReaderL10n;
  const typeinfo = JSON.parse(h.dbconfig.typeinfo_json) as ReaderTypeInfo;

  const dict = new Dictionary(
    { msets: [findMonads(h, "Genesis", 1, 1, 1)], inQuiz: false, showIcons: false },
    { mql: h.mql, dbinfo: JSON.parse(h.dbconfig.dbinfo_json), l10nJson: h.dbconfig.l10n_json },
  );
  const t = buildDisplayTree(dict.toJSON(), {
    grammar: enhanceSentenceGrammar(dbinfo.sentencegrammar),
    l10n,
    typeinfo,
    objectSettings: dbinfo.objectSettings,
    charset: makeCharset(dbinfo.charSet),
    databaseName: "ETCBC4",
  });

  assert.equal(t.root.level, 4);
  assert.equal(t.root.objType, "Patriarch");

  const words = leaves(t.root);
  // La frase (oración) del pasaje Gn 1:1-1:1 es el versículo completo (11 palabras)
  assert.equal(words.length, 11);
  // ETCBC4 divide "בראשית" en dos palabras: "בְּ" + "רֵאשִׁ֖ית" (cont → sin espacio)
  assert.equal(words[0].text, "בְּ");
  assert.equal(words[1].text, "רֵאשִׁ֖ית ");
  assert.equal(words[0].cont, "cont");
  assert.equal(words[0].text + words[1].text.trimEnd(), "בְּרֵאשִׁ֖ית");
  assert.equal(words[0].verse, 1);
  assert.equal(words[1].verse, null);
  // Todo el versículo está en la misma frase → sin más números de versículo
  assert.ok(words.every((w) => w.verse === null || w.verse === 1));

  // Todo el mundo tiene padre (palabras dentro de frases, frases dentro de cláusulas…)
  assert.equal(t.root.children.length, 1);
  const sent = t.root.children[0] as DisplayBox;
  assert.equal(sent.level, 3);
  assert.equal(sent.shortName, "Sentence");
  const clauses = sent.children as DisplayBox[];
  assert.ok(clauses.length >= 1);
  assert.ok(clauses.every((c) => c.kind === "box" && c.level === 2));

  // wordgrammar: hay gloss en tenpoint ltr en la primera palabra
  const gloss = words[0].wordgrammar.find((g) => g.featName === "english");
  assert.ok(gloss);
  assert.equal(gloss.wordclass, "tenpoint ltr");
  assert.ok(gloss.value.length > 0);

  // Indentación: la cláusula tiene tab
  const withIndent = clauses.filter((c) => c.indent !== null);
  assert.ok(withIndent.length > 0);
  assert.ok(t.indentMax >= t.indentMin);

  // El primer nivel 1 (frase) contiene palabras en orden
  const phrases = clauses.flatMap((c) => c.children.filter((x) => x.kind === "box")) as DisplayBox[];
  assert.ok(phrases.length >= 1);
  assert.ok(phrases.every((p) => p.level === 1));

  // Frecuencia: la primera palabra tiene frequency_rank (colorización)
  assert.equal(typeof words[0].frequencyRank, "number");
});
