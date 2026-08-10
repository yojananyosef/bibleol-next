/**
 * legacy-ts quiz: tests de paridad del port del cliente legacy
 * (dictionary.ts, displaymonadobject.ts, panelquestion.ts, answer.ts,
 * quiz.ts) usando datos sintéticos en el formato del servidor.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { enhanceSentenceGrammar, type ReaderSentenceGrammar } from "../../src/lib/reader/sentencegrammar.ts";
import { makeCharset } from "../../src/lib/reader/charset.ts";
import { parseMonadSet } from "../../src/legacy-ts/monadobject.ts";
import type { Localization } from "../../src/legacy-ts/localization.ts";
import { initLocalization, localize } from "../../src/legacy-ts/localization.ts";
import type { Configuration, TypeInfo } from "../../src/legacy-ts/configuration.ts";
import { initConfiguration } from "../../src/legacy-ts/configuration.ts";
import type { QuizData } from "../../src/legacy-ts/quizdata.ts";
import { initQuizData } from "../../src/legacy-ts/quizdata.ts";
import { serverDictionaryToLegacy, Dictionary, type ServerDictionaryIf } from "../../src/legacy-ts/dictionary.ts";
import type { DisplayCtx } from "../../src/legacy-ts/displaymonadobject.ts";
import { PanelQuestion, Cursor } from "../../src/legacy-ts/panelquestion.ts";
import { Quiz, type QuizUi } from "../../src/legacy-ts/quiz.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: corpus sintético estilo ETCBC4 (2 frases de 3 palabras)
// ─────────────────────────────────────────────────────────────────────────────

const l10n: Localization = {
  dbdescription: "Test",
  dbcopyright: "",
  emdrosobject: {
    word: { _objname: "Word", g_lex_utf8: "Lexeme", english: "Gloss" },
    word_abbrev: { _objname: "W" },
    phrase: { _objname: "Phrase", typ: "Type", function: "Function" },
    clause: { _objname: "Clause", typ: "Type", kind: "Kind" },
    clause_abbrev: { _objname: "Cl" },
    sentence: { _objname: "Sentence" },
  },
  emdrostype: {
    clause_kind_abbrev: { WQ: "WQ", NJ: "NJ" },
    clause_kind: { WQ: "Wh-question", NJ: "Narrative" },
    clause_typ: { Cl: "Clause" },
  },
  grammargroup: { word: { glosses: "Glosses" } },
  universe: {
    book: { _label: "Book", Genesis: "Genesis" },
    chapter: { _label: "Chapter" },
    verse: { _label: "Verse" },
  },
};

const sentencegrammarJson: ReaderSentenceGrammar[] = [
  {
    mytype: "SentenceGrammar",
    objType: "word",
    items: [
      { mytype: "GrammarFeature", name: "g_lex_utf8" },
      { mytype: "GrammarFeature", name: "english" },
    ],
  },
  { mytype: "SentenceGrammar", objType: "phrase", items: [{ mytype: "GrammarFeature", name: "typ" }, { mytype: "GrammarFeature", name: "function" }] },
  { mytype: "SentenceGrammar", objType: "clause", items: [{ mytype: "GrammarFeature", name: "typ" }, { mytype: "GrammarFeature", name: "kind" }] },
  { mytype: "SentenceGrammar", objType: "sentence", items: [] },
];

const objectSettings: Configuration["objectSettings"] = {
  word: {
    featuresetting: {
      g_lex_utf8: { foreignText: true },
      english: { isGloss: true },
    },
  },
  phrase: { featuresetting: { typ: {}, function: {} } },
  clause: { featuresetting: { typ: {}, kind: { otherValues: ["x"] } } },
  sentence: { featuresetting: {} },
};

const configuration: Configuration = {
  version: 1,
  databaseName: "test",
  propertiesName: "test",
  charSet: "hebrew",
  databaseVersion: "1",
  granuarity: "sentence",
  surfaceFeature: "g_lex_utf8",
  objHasSurface: "word",
  suffixFeature: "lex_after_utf8",
  useSofPasuq: true,
  objectSettings,
  universeHierarchy: [
    { type: "book", feat: "book" },
    { type: "chapter", feat: "chapter" },
    { type: "verse", feat: "verse" },
  ],
  picDb: "",
  sentencegrammar: sentencegrammarJson,
  maxLevels: sentencegrammarJson.length + 1,
};

const typeinfo: TypeInfo = {
  objTypes: ["word", "phrase", "clause", "sentence"],
  obj2feat: {
    word: { g_lex_utf8: "string", english: "string" },
    phrase: { typ: "phrase_typ", function: "phrase_function" },
    clause: { typ: "clause_typ", kind: "clause_kind" },
    sentence: {},
  },
  enumTypes: ["phrase_typ", "phrase_function", "clause_typ", "clause_kind"],
  enum2values: {
    phrase_typ: ["D", "N"],
    phrase_function: ["Subj", "Obj"],
    clause_typ: ["Cl"],
    clause_kind: ["WQ", "NJ", "x"],
  },
};

/** Fábrica de una frase del servidor (MonadObjectJSON). */
function sentence(monads: [number, number], words: [string, string, string, string][]): ServerDictionaryIf {
  const lo = monads[0];
  const wordObjects = words.map((w, i) => ({
    kind: "single" as const,
    id_d: 1000 + lo + i,
    name: "word",
    monads: `{ ${lo + i} }`,
    features: { g_lex_utf8: w[0], lex_after_utf8: w[1], english: w[2] },
    children_idds: null,
    text: w[0],
    suffix: w[1],
    bcv: [1, 1, w[3]],
    bcv_loc: "1:1",
    sameAsNext: [false, false, i < words.length - 1],
    sameAsPrev: [false, false, i > 0],
    pics: [],
    urls: [],
  }));
  const ids = words.map((_, i) => 1000 + lo + i);
  const phrase = {
    kind: "multiple" as const,
    id_d: 2000 + lo,
    name: "phrase",
    monads: `{ ${lo}-${lo + words.length - 1} }`,
    features: { typ: "N", function: "Subj" },
    children_idds: ids,
    subobjects: null,
  };
  const clause = {
    kind: "multiple" as const,
    id_d: 3000 + lo,
    name: "clause",
    monads: `{ ${lo}-${lo + words.length - 1} }`,
    features: { typ: "Cl", kind: lo === 1 ? "WQ" : "NJ" },
    children_idds: [2000 + lo],
    subobjects: null,
  };
  const sentenceObj = {
    kind: "multiple" as const,
    id_d: 4000 + lo,
    name: "sentence",
    monads: `{ ${lo}-${lo + words.length - 1} }`,
    features: {},
    children_idds: [3000 + lo],
    subobjects: null,
  };
  const patriarch = {
    kind: "multiple" as const,
    id_d: 9000 + lo,
    name: "book",
    monads: `{ ${lo}-${lo + words.length - 1} }`,
    features: {},
    children_idds: [4000 + lo],
    subobjects: null,
  };
  return {
    bookTitle: "Genesis",
    sentenceSets: [`{ ${lo}-${lo + words.length - 1} }`],
    sentenceSetsQuiz: null,
    monadObjects: [
      [
        { level: 0, objects: wordObjects },
        { level: 1, objects: [phrase] },
        { level: 2, objects: [clause] },
        { level: 3, objects: [sentenceObj] },
        { level: 4, objects: [patriarch] },
      ],
    ],
  };
}

function makeQuizData(lo: number): QuizData {
  const idD = 3000 + lo;
  const monad2Id: QuizData["monad2Id"] = [];
  monad2Id[lo] = idD;
  monad2Id[lo + 1] = idD;
  monad2Id[lo + 2] = idD;
  const id2FeatVal: QuizData["id2FeatVal"] = [];
  id2FeatVal[idD] = { typ: "Cl", kind: lo === 1 ? "WQ" : "NJ" };
  return {
    quizid: 7,
    quizFeatures: {
      showFeatures: ["typ"],
      requestFeatures: [{ name: "kind", usedropdown: false, hideFeatures: [] }],
      dontShowFeatures: [],
      dontShowObjects: [],
      objectType: "clause",
      hideWord: false,
      glosslimit: 10,
      useVirtualKeyboard: false,
    },
    desc: "Exercise <a href='http://example.com'>link</a>",
    maylocate: false,
    sentbefore: 0,
    sentafter: 0,
    fixedquestions: 0,
    randomize: false,
    monad2Id,
    id2FeatVal,
  };
}

function makeCtx(): DisplayCtx {
  return {
    l10n,
    typeinfo,
    charset: makeCharset(configuration.charSet),
    sentencegrammar: enhanceSentenceGrammar(sentencegrammarJson),
    siteUrl: "/",
    surfaceFeature: configuration.surfaceFeature,
    suffixFeature: configuration.suffixFeature,
  };
}

function setup(): void {
  initLocalization(l10n, {});
  initConfiguration(configuration, typeinfo);
}

/** Copia profunda del typeinfo compartido (los tests no deben mutarlo). */
function cloneTypeInfo(): TypeInfo {
  return JSON.parse(JSON.stringify(typeinfo)) as TypeInfo;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseMonadSet + adapter
// ─────────────────────────────────────────────────────────────────────────────

test("parseMonadSet: rangos y monads sueltos", () => {
  assert.deepEqual(parseMonadSet("{ 1-3, 5, 7-9 }"), {
    segments: [
      { low: 1, high: 3 },
      { low: 5, high: 5 },
      { low: 7, high: 9 },
    ],
  });
});

test("serverDictionaryToLegacy: convierte formato del servidor al del cliente", () => {
  const d = serverDictionaryToLegacy(sentence([1, 3], [["בראשׁית", "-", "beginning", "1"], ["ברא", "x", "create", "1"], ["אלהים", "", "God", "1"]]));
  assert.equal(d.sentenceSets.length, 1);
  assert.equal(d.sentenceSets[0].segments[0].low, 1);
  assert.equal(d.monadObjects[0][0].length, 3); // nivel 0 = palabras
  const w = d.monadObjects[0][0][0];
  assert.equal(w.mo.id_d, 1001);
  assert.equal(w.mo.name, "word");
  assert.deepEqual(w.mo.monadset.segments, [{ low: 1, high: 1 }]);
  assert.equal((w as never as { text: string }).text, "בראשׁית");
  assert.equal((w as never as { bcv_loc: string }).bcv_loc, "1:1");
});

// ─────────────────────────────────────────────────────────────────────────────
// Dictionary + generateSentenceHtml (modo quiz)
// ─────────────────────────────────────────────────────────────────────────────

test("Dictionary.generateSentenceHtml: quiz resalta objetos y acumula texto", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  initQuizData(qd, true);
  const dict = new Dictionary(dictif, 0, qd, makeCtx());

  const html = dict.generateSentenceHtml(qd);
  // El texto acumulado: w1 suffix '-' (contx, sin espacio), w2 suffix 'x' (espacio), w3 suffix '' (cont, sin espacio)
  assert.equal(html, "<em>אחד</em>-<em>שני</em>x <em>שׁלושׁי</em>");

  // El HTML del árbol incluye los spans de quiz (text-danger) y data-idd
  const treeHtml = displayTreeHtml(dict, qd);
  assert.match(treeHtml, /<span class="textdisplay hebrew text-danger[^"]*" data-idd="1001">/);
  assert.match(treeHtml, /<em>אחד<\/em>/);
  assert.match(treeHtml, /clause_kind/);
});

test("Dictionary.generateSentenceHtml: hideWord reemplaza por números", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  qd.quizFeatures.hideWord = true;
  initQuizData(qd, true);
  const dict = new Dictionary(dictif, 0, qd, makeCtx());

  const html = dict.generateSentenceHtml(qd);
  assert.equal(html, "<em>(1)</em>-<em>(2)</em>x <em>(3)</em>");
});

test("Dictionary.toolTipFunc: filtra features en quiz (mayShowFeature)", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  initQuizData(qd, true);
  const dict = new Dictionary(dictif, 0, qd, makeCtx());

  const [contents, heading] = dict.toolTipFunc(3001, 0, true);
  assert.match(contents, /tooltiphead/);
  assert.equal(heading, "Clause");
});

// Helper: reconstruye el HTML del árbol (patriarch → hijos)
function displayTreeHtml(dict: Dictionary, qd: QuizData): string {
  const arr = [""];
  const root = dict.dispMonadObjects[dict.dispMonadObjects.length - 1][0];
  return root.generateHtml(qd, arr, dict.sentenceSetQuiz, makeCtx());
}

// ─────────────────────────────────────────────────────────────────────────────
// PanelQuestion
// ─────────────────────────────────────────────────────────────────────────────

test("PanelQuestion: encabezados, filas y vAnswers (enumeration select)", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  initQuizData(qd, true);
  const dict = new Dictionary(dictif, 0, qd, makeCtx());

  const panel = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, typeinfo);

  assert.equal(panel.cards.length, 1);
  assert.equal(panel.subQuizMax, 1);
  assert.equal(panel.vAnswers.length, 1);
  assert.equal(panel.question_stat.text, "<em>אחד</em>-<em>שני</em>x <em>שׁלושׁי</em>");
  assert.equal(panel.question_stat.location, "1, 1, 1");

  // 1 display row (typ) + 1 request row (kind)
  assert.equal(panel.cards[0].rows.length, 2);
  const row0 = panel.cards[0].rows[0];
  assert.equal(row0.header, "<th>Type</th>");
  assert.equal(row0.body.kind, "textPlain");
  const row1 = panel.cards[0].rows[1];
  assert.equal(row1.header, "<th>Kind</th>");
  assert.equal(row1.body.kind, "select");

  // getInputTypes: la request es una enumeration (radio)
  assert.deepEqual(panel.getInputTypes(), ["radio"]);

  // KeyTable: la tecla 'w' (Wh-question) apunta a la opción correcta
  const ids = panel.keytable.get_element(0, 1, "w");
  assert.ok(ids !== undefined && ids.length >= 1);
});

test("PanelQuestion: respuesta correcta e incorrecta (checkIt/commitIt)", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  initQuizData(qd, true);
  const dict = new Dictionary(dictif, 0, qd, makeCtx());
  const panel = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, typeinfo);
  const answer = panel.vAnswers[0];

  // Respuesta correcta: internal 'WQ'
  answer.compRef.handle.setCheckedValues?.(["WQ"]);
  answer.checkIt(false, true);
  assert.equal(answer.usersAnswerWasCorrect(), true);
  assert.equal(answer.usersAnswer(), "WQ");
  assert.equal(answer.compRef.getState(), "yes");

  // Respuesta incorrecta: el icono cambia a 'no', pero la primera respuesta
  // "pega" (semántica legacy: firstAnswer/firstAnswerCorrect solo se asignan una vez)
  answer.compRef.handle.setCheckedValues?.(["NJ"]);
  answer.checkIt(false, true);
  assert.equal(answer.usersAnswerWasCorrect(), true); // legacy: la primera respuesta cuenta
  assert.equal(answer.compRef.getState(), "no");
});

test("PanelQuestion: showAnswerButton muestra la respuesta correcta", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  initQuizData(qd, true);
  const dict = new Dictionary(dictif, 0, qd, makeCtx());
  const panel = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, typeinfo);

  panel.showAnswerButton();
  const answer = panel.vAnswers[0];
  assert.equal(answer.compRef.getState(), "yes");
  assert.equal(answer.usersAnswer(), "*Unanswered*"); // No se había respondido
});

test("PanelQuestion: texto libre con matchregexp y respuesta '-' (maqaf)", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  // Convierte la request en texto libre (ascii) con matchregexp
  qd.quizFeatures.requestFeatures = [{ name: "kind", usedropdown: false, hideFeatures: [] }];
  const ti = cloneTypeInfo();
  (ti.obj2feat.clause as Record<string, string>).kind = "ascii";
  initQuizData(qd, true);

  const dict = new Dictionary(dictif, 0, qd, makeCtx());
  const panel = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, ti);
  const answer = panel.vAnswers[0];

  answer.compRef.handle.setValue("WQ");
  answer.checkIt(false, false);
  assert.equal(answer.usersAnswerWasCorrect(), true);

  // 'Unanswered' si vacío (nuevo panel: commitIt solo marca la primera respuesta)
  const panel2 = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, ti);
  panel2.vAnswers[0].commitIt();
  assert.equal(panel2.vAnswers[0].usersAnswer(), "*Unanswered*");
});

test("PanelQuestion: teclado virtual (textForeign) genera letras y atajos", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  // Request feature hebrea extranjera
  qd.quizFeatures.objectType = "word";
  qd.quizFeatures.requestFeatures = [{ name: "g_lex_utf8", usedropdown: false, hideFeatures: [] }];
  qd.quizFeatures.showFeatures = [];
  const monad2Id: QuizData["monad2Id"] = [];
  monad2Id[1] = 1001;
  monad2Id[2] = 1002;
  monad2Id[3] = 1003;
  qd.monad2Id = monad2Id;
  const id2FeatVal: QuizData["id2FeatVal"] = [];
  id2FeatVal[1001] = { g_lex_utf8: "אחד" };
  id2FeatVal[1002] = { g_lex_utf8: "שני" };
  id2FeatVal[1003] = { g_lex_utf8: "שׁלושׁי" };
  qd.id2FeatVal = id2FeatVal;
  initQuizData(qd, true);

  const dict = new Dictionary(dictif, 0, qd, makeCtx());
  const panel = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, typeinfo);

  assert.equal(panel.hasForeignInput, true);
  const body = panel.cards[0].rows[0].body;
  assert.equal(body.kind, "textForeign");
  if (body.kind === "textForeign") {
    assert.ok(body.letters.length > 0);
    const letters = body.letters.map((l) => l.letter);
    assert.ok(letters.includes("א")); // letras de la respuesta
    assert.ok(letters.includes("-")); // en hebreo siempre hay opción vacía
    // Atajos: א→'>'
    const shin = body.letters.find((l) => l.letter === "א");
    assert.equal(shin?.shortcut, ">");
    // El atajo '>' está en la KeyTable para la fila 0
    assert.ok(panel.keytable.get_element(0, 0, ">") !== undefined);
  }

  // Respuesta correcta vía handle (como hace React al pulsar letras)
  const answer = panel.vAnswers[0];
  answer.compRef.handle.setValue("אחד");
  answer.checkIt(false, false);
  assert.equal(answer.usersAnswerWasCorrect(), true);

  // Cometida sin responder (panel nuevo: la primera respuesta "pega")
  const panel2 = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, typeinfo);
  panel2.vAnswers[0].commitIt();
  assert.equal(panel2.vAnswers[0].usersAnswer(), "*Unanswered*");
});

test("PanelQuestion: checkboxes (list of)", () => {
  setup();
  const dictif = serverDictionaryToLegacy(
    sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]),
  );
  const qd = makeQuizData(1);
  const ti = cloneTypeInfo();
  (ti.obj2feat.clause as Record<string, string>).kind = "list of clause_kind";
  qd.quizFeatures.requestFeatures = [{ name: "kind", usedropdown: false, hideFeatures: [] }];
  qd.id2FeatVal[3001] = { typ: "Cl", kind: "(WQ,NJ)" };
  initQuizData(qd, true);

  const dict = new Dictionary(dictif, 0, qd, makeCtx());
  const panel = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, ti);
  const answer = panel.vAnswers[0];
  assert.equal(answer.cType, "checkBoxes"); // COMPONENT_TYPE.checkBoxes

  // Marca exactamente los correctos → correcto
  answer.compRef.handle.setCheckedValues?.(["WQ", "NJ"]);
  answer.checkIt(false, false);
  assert.equal(answer.usersAnswerWasCorrect(), true);
  assert.equal(answer.usersAnswer(), "(NJ,WQ)");

  // Marca uno de más → incorrecto (panel nuevo: la primera respuesta "pega")
  const panel2 = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, ti);
  panel2.vAnswers[0].compRef.handle.setCheckedValues?.(["WQ", "NJ", "x"]);
  panel2.vAnswers[0].checkIt(false, false);
  assert.equal(panel2.vAnswers[0].usersAnswerWasCorrect(), false);

  // Nada marcado → unanswered
  const panel3 = new PanelQuestion(qd, dict, false, makeCtx().charset, l10n, ti);
  panel3.vAnswers[0].commitIt();
  assert.equal(panel3.vAnswers[0].usersAnswer(), "*Unanswered*");
});

// ─────────────────────────────────────────────────────────────────────────────
// Quiz (máquina de estados)
// ─────────────────────────────────────────────────────────────────────────────

function makeUi(): QuizUi & { calls: string[]; sent: unknown[] } {
  return {
    calls: [],
    sent: [],
    hidePrevQuestion() {
      this.calls.push("hidePrev");
    },
    showPrevQuestion() {
      this.calls.push("showPrev");
    },
    disableNext() {
      this.calls.push("disableNext");
    },
    enableNext() {
      this.calls.push("enableNext");
    },
    enableFinish() {
      this.calls.push("enableFinish");
    },
    disableFinish() {
      this.calls.push("disableFinish");
    },
    setProgress(index: number, max: number) {
      this.calls.push(`progress:${index}/${max}`);
    },
    setProgressText(text: string) {
      this.calls.push(`progresstext:${text}`);
    },
    setDesc(html: string) {
      this.calls.push(`desc:${html}`);
    },
    scrollToQuestion(first: boolean) {
      this.calls.push(`scroll:${first ? "first" : "next"}`);
    },
    navigateTo(url: string) {
      this.calls.push(`nav:${url}`);
    },
    showError(message: string) {
      this.calls.push(`error:${message}`);
    },
    showSendingStatistics() {
      this.calls.push("sending");
    },
    alert(message: string) {
      this.calls.push(`alert:${message}`);
    },
    sendStatistics(statistics: never) {
      this.sent.push(statistics);
      return Promise.resolve(true);
    },
  };
}

test("Quiz: nextQuestion/prevQuestion navega y guarda respuestas", async () => {
  setup();
  // Dos frases → dos preguntas
  const s1 = sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]);
  const s2 = sentence([10, 3], [["דבר", "-", "word", "10"], ["על", "x", "on", "10"], ["הר", "", "mountain", "10"]]);
  const merged: ServerDictionaryIf = {
    bookTitle: "Genesis",
    sentenceSets: [`{ 1-3 }`, `{ 10-12 }`],
    sentenceSetsQuiz: null,
    monadObjects: [s1.monadObjects[0], s2.monadObjects[0]],
  };

  const dictif = serverDictionaryToLegacy(merged);
  const qd1 = makeQuizData(1);
  initQuizData(qd1, true);

  const ui = makeUi();
  const quiz = new Quiz(7, false, qd1, dictif, ui as never, makeCtx(), makeCtx().charset, l10n, typeinfo);

  // Primera pregunta
  quiz.nextQuestion(true);
  assert.equal(quiz.currentIndex, 0);
  assert.ok(quiz.currentPanel !== null);
  assert.ok(ui.calls.includes("progress:1/2"));
  assert.ok(ui.calls.includes("desc:Exercise <a href='http://example.com'>link</a>"));

  // Responde correctamente y avanza
  const a1 = quiz.currentPanel!.vAnswers[0];
  a1.compRef.handle.setCheckedValues?.(["WQ"]);
  quiz.nextQuestion(false);
  assert.equal(quiz.currentIndex, 1);
  assert.deepEqual(JSON.parse(quiz.logMyDictionary())["0"], ["WQ"]);
  assert.ok(ui.calls.includes("disableNext"));
  assert.ok(ui.calls.includes("enableFinish"));

  // Vuelve atrás: la respuesta se recarga
  quiz.prevQuestion();
  assert.equal(quiz.currentIndex, 0);
  assert.ok(ui.calls.includes("hidePrev")); // estamos en la pregunta 0
  assert.ok(ui.calls.includes("progresstext:1/2"));
  assert.equal(quiz.currentPanel!.vAnswers[0].compRef.handle.getValue(), "WQ");

  // Termina (la navegación ocurre en el microtask del .then de sendStatistics)
  quiz.finishQuiz(true);
  assert.equal(ui.sent.length, 1);
  const payload = ui.sent[0] as { questions: unknown[]; grading: boolean; quizid: number };
  assert.equal(payload.grading, true);
  assert.equal(payload.quizid, 7);
  assert.equal(payload.questions.length, 2);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(ui.calls.includes("nav:text/select_quiz"));
});

test("Quiz: sin login (quizid -1) navega a la selección", () => {
  setup();
  const dictif = serverDictionaryToLegacy(sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]));
  const qd = makeQuizData(1);
  qd.quizid = -1;
  initQuizData(qd, true);

  const ui = makeUi();
  const quiz = new Quiz(-1, false, qd, dictif, ui as never, makeCtx(), makeCtx().charset, l10n, typeinfo);
  quiz.nextQuestion(true);
  quiz.finishQuiz(false);

  assert.ok(ui.calls.includes("nav:text/select_quiz"));
  assert.equal(ui.sent.length, 0);
});

test("Quiz: modo examen muestra prev y no navega tras terminar sin sesión", () => {
  setup();
  const dictif = serverDictionaryToLegacy(sentence([1, 3], [["אחד", "-", "one", "1"], ["שני", "x", "two", "1"], ["שׁלושׁי", "", "three", "1"]]));
  const qd = makeQuizData(1);
  qd.quizid = -1;
  initQuizData(qd, true);

  const ui = makeUi();
  const quiz = new Quiz(-1, true, qd, dictif, ui as never, makeCtx(), makeCtx().charset, l10n, typeinfo);
  quiz.nextQuestion(true);
  assert.equal(quiz.exam_mode, true);
  quiz.finishQuiz(true);
  assert.ok(ui.calls.includes("nav:exam/active_exams"));
});

// ─────────────────────────────────────────────────────────────────────────────
// localize y Cursor
// ─────────────────────────────────────────────────────────────────────────────

test("localize: devuelve '??key??' si falta la traducción", () => {
  setup();
  assert.equal(localize("sending_statistics"), "??sending_statistics??");
});

test("Cursor: navegación entre filas con límites", () => {
  Cursor.onChange = null;
  Cursor.init(1, 3);
  assert.equal(Cursor.row, 1);
  assert.equal(Cursor.prevNextItem(1), true);
  assert.equal(Cursor.row, 2);
  assert.equal(Cursor.prevNextItem(1), false); // 3 no es < 3
  assert.equal(Cursor.prevNextItem(-1), true);
  assert.equal(Cursor.row, 1);
  assert.equal(Cursor.prevNextItem(-1), false); // 0 no es >= 1
});
