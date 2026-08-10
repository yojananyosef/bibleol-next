import { test } from "node:test";
import assert from "node:assert/strict";
import { calcTimeLimit, checkQuizName, editorJsonToTemplate } from "../../src/lib/services/quizeditor.ts";
import { getUserById } from "../../src/lib/services/users.ts";

// ---------------------------------------------------------------------------
// editorJsonToTemplate (Ctrl_text::save_quiz2): JSON del editor → QuizTemplate
// ---------------------------------------------------------------------------

const LEGACY_JSON = {
  desc: "Test editor",
  database: "ETCBC4",
  properties: "ETCBC4",
  selectedPaths: ["Genesis 1:1/1/39"],
  sentenceSelection: {
    object: "sentence",
    mql: null,
    featHand: {
      vhand: [
        {
          type: "stringfeature",
          name: "book",
          comparator: "equals",
          values: ["Genesis"],
        },
      ],
    },
    useForQo: false,
  },
  quizObjectSelection: {
    object: "word",
    mql: null,
    featHand: { vhand: [] },
    useForQo: false,
  },
  quizFeatures: {
    showFeatures: ["visual"],
    requestFeatures: [
      { name: "beta", usedropdown: false, hideFeatures: null, order_val: "3" },
      { name: "alpha", usedropdown: true, hideFeatures: null, order_val: "1" },
      { name: "gamma", usedropdown: false, hideFeatures: null, order_val: "2" },
    ],
    dontShowFeatures: [],
    dontShowObjects: [{ content: "lexeme", show: "lex" }],
    glosslimit: 3000,
  },
  maylocate: true,
  sentbefore: 1,
  sentafter: 0,
  fixedquestions: -3,
  randomize: true,
};

test("editorJsonToTemplate: ordena las request features por order_val (writeAsXml)", () => {
  const tpl = editorJsonToTemplate(LEGACY_JSON);

  assert.deepEqual(
    tpl.quizFeatures.requestFeatures.map((rf) => [rf.name, rf.order_val]),
    [
      ["alpha", 1],
      ["gamma", 2],
      ["beta", 3],
    ],
  );
  assert.equal(tpl.quizFeatures.showFeatures[0], "visual");
  assert.deepEqual(tpl.quizFeatures.dontShowObjects, [{ content: "lexeme", show: "lex" }]);
  assert.equal(tpl.quizFeatures.glosslimit, 3000);
});

test("editorJsonToTemplate: featHand con valores → handlers de plantilla; sin valores → []", () => {
  const tpl = editorJsonToTemplate(LEGACY_JSON);

  assert.equal(tpl.sentenceSelection.featHand.length, 1);
  const book = tpl.sentenceSelection.featHand[0] as unknown as { name: string; comparator: string };
  assert.equal(book.name, "book");
  assert.equal(book.comparator, "equals");
  // word (empty vhand) no genera handlers
  assert.equal(tpl.quizObjectSelection.featHand.length, 0);
});

test("editorJsonToTemplate: MQL directo se conserva y los negativos se recortan", () => {
  const tpl = editorJsonToTemplate({
    ...LEGACY_JSON,
    sentenceSelection: { object: "verse", mql: "[verse book=Genesis]", featHand: null, useForQo: false },
    fixedquestions: -3,
  });

  assert.equal(tpl.sentenceSelection.mql, "[verse book=Genesis]");
  assert.equal(tpl.fixedquestions, 0);
  assert.equal(tpl.maylocate, true);
  assert.equal(tpl.sentbefore, 1);
});

// ---------------------------------------------------------------------------
// calcTimeLimit (submit_quiz/test_quiz)
// ---------------------------------------------------------------------------

test("calcTimeLimit: 0 → -1 (unlimited); si no, +3 segundos de buffer", () => {
  assert.equal(calcTimeLimit(0, 0), -1);
  assert.equal(calcTimeLimit(1, 0), 63);
  assert.equal(calcTimeLimit(2, 30), 153);
});

// ---------------------------------------------------------------------------
// checkQuizName (check_submit_quiz)
// ---------------------------------------------------------------------------

test("checkQuizName: nombre ilegal → BADNAME", () => {
  assert.deepEqual(checkQuizName("ETCBC4/demo", "a?b", getUserById(1)), { status: "BADNAME" });
  assert.deepEqual(checkQuizName("ETCBC4/demo", "a/b", getUserById(1)), { status: "BADNAME" });
});

test("checkQuizName: nombre libre → OK", () => {
  assert.deepEqual(checkQuizName("ETCBC4/demo", "__no_such_quiz__", getUserById(1)), { status: "OK" });
});

test("checkQuizName: existe y soy admin (o el owner) → EXISTS", () => {
  assert.deepEqual(checkQuizName("ETCBC4/demo", "demo1", getUserById(1)), { status: "EXISTS" });
});

test("checkQuizName: existe pero no soy el owner ni admin → error", () => {
  assert.deepEqual(checkQuizName("ETCBC4/demo", "demo1", getUserById(2)), {
    error: "You are not the owner of this file",
  });
});