import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  QuizError,
  showQuiz,
  showQuizUniverse,
  addUniverseLevel,
  getTimeSeconds,
} from "../../src/lib/services/text-quiz.ts";

const DEMO_DIR = "/home/j/dev/BibleOL/quiz_templates/ETCBC4/demo";
const notLoggedIn = { userid: 0, loggedIn: false };

test("showQuiz: payload de quiz (sin login)", () => {
  const file = path.join(DEMO_DIR, "number_state.3et");
  const payload = showQuiz(file, 1, null, notLoggedIn);

  assert.equal(payload.is_quiz, true);
  assert.equal(payload.is_logged_in, false);
  assert.equal(payload.is_unlimited, true);
  assert.equal(payload.time_seconds, null);
  assert.equal(payload.useTooltip_str, "false");
  assert.equal(payload.number_of_quizzes, 1);
  assert.ok(payload.number_small_questions > 0);

  const quizData = JSON.parse(payload.quizData_json) as {
    desc: string;
    quizFeatures: { objectType: string };
    quizid: number;
  };
  assert.equal(quizData.quizid, -1);
  assert.ok(quizData.desc.length > 0);
  assert.ok(quizData.quizFeatures.objectType.length > 0);

  const dictionaries = JSON.parse(payload.dictionaries_json) as { sentenceSets: unknown[] } | null;
  assert.ok(dictionaries !== null, "dictionaries_json no puede ser null");
  assert.ok(Array.isArray(dictionaries.sentenceSets));

  const dbinfo = JSON.parse(payload.dbinfo_json) as { granularity: string };
  assert.ok(dbinfo.granularity.length > 0);

  assert.ok(payload.mql_list.includes("GOqxqxqx"));
});

test("showQuiz: quiz inexistente → QuizError(cannot_open_file)", () => {
  assert.throws(
    () => showQuiz("/nonexistent/quiz.3et", 1, null, notLoggedIn),
    (e: unknown) => e instanceof QuizError && e.message === "cannot_open_file",
  );
});

test("showQuizUniverse: árbol jstree con paths marcados", () => {
  const file = path.join(DEMO_DIR, "number_state.3et");
  const res = showQuizUniverse(file, "Everything");

  const tree = JSON.parse(res.tree_data) as {
    data: string;
    state?: string;
    children?: { attr?: { "data-ref"?: string } }[];
  };
  assert.equal(tree.data, "Everything");
  assert.equal(tree.state, "open");
  assert.ok((tree.children?.length ?? 0) > 0);
  assert.ok(res.markedList.length > 0);
  assert.ok(res.db.length > 0);
  assert.ok(res.prop.length > 0);
});

test("addUniverseLevel: expansión perezosa de nivel", () => {
  const res = showQuizUniverse(path.join(DEMO_DIR, "number_state.3et"), "Everything");
  const prop = res.prop;
  const tree = JSON.parse(res.tree_data) as {
    attr?: { "data-rangelow": number; "data-rangehigh": number; "data-lev": number; "data-ref": string };
    children?: unknown[];
  };

  const child = (tree.children?.[0] ?? {}) as typeof tree;
  assert.ok(child.attr, "el primer hijo debe tener attr");

  const nodes = JSON.parse(
    addUniverseLevel(prop, child.attr["data-rangelow"], child.attr["data-rangehigh"], child.attr["data-ref"], child.attr["data-lev"], "Everything"),
  ) as { data: string; attr?: { "data-lev": number } }[];
  assert.ok(nodes.length > 0);
  assert.equal(nodes[0].attr?.["data-lev"], child.attr["data-lev"]);
});

test("getTimeSeconds: null sin fila en exerciseowner", () => {
  assert.equal(getTimeSeconds("/definitely/not/in/db.3et"), null);
});
