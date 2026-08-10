/**
 * services/quizeditor.ts — Servidor del editor de ejercicios.
 *
 * Port 1:1 de Ctrl_text::edit_quiz / new_quiz / check_submit_quiz /
 * submit_quiz / test_quiz, sobre las piezas ya portadas (text-quiz.ts:
 * editQuiz, newQuiz, saveQuiz, packageTestQuiz; quizpath.ts: setOwner…).
 *
 * El payload de la página usa la forma "legacy" del JSON del editor
 * (featHand:{vhand:[…]}), que es la que consume la UI portada.
 */

import { getAppDb } from "../db/sqlite.ts";
import { createQuizPath } from "./quizpath.ts";
import { getEmdros } from "../corpus/emdros.ts";
import {
  decodeQuiz,
  newQuiz,
  packageTestQuiz,
  saveQuiz,
  showQuizUniverse,
  universeFor,
} from "./text-quiz.ts";
import {
  editorMqlDataOf,
  editorQuizFeaturesOf,
  wireMqlDataOf,
  wireQuizFeaturesOf,
  type EditorFeatureHandler,
} from "../quiz/editor-logic.ts";
import type { QuizTemplate } from "../quiz/template-parser.ts";
import type { UserRow } from "./users.ts";
import { isAdmin } from "./users.ts";
import { QuizError } from "./text-quiz.ts";

// ---------------------------------------------------------------------------
// Strings de interfaz (port de myapp/language/langsrc/en/js_lang.php)
// ---------------------------------------------------------------------------

export function getL10nJsJson(): string {
  return JSON.stringify({
    "1st_choice": "1st choice",
    "2nd_choice": "2nd choice",
    "3rd_choice": "3rd choice",
    "4th_choice": "4th choice",
    add_entry_button: "Add line",
    badname: "Illegal character in filename",
    cancel_button: "Cancel",
    clear_all: "Clear all",
    clear_button: "Clear",
    context_sentences: "Number of context sentences:",
    description: "Description",
    dont_care: "Don't care",
    dont_show: "Don't show",
    edit_quiz: "Edit Quiz",
    enter_filename_no_3et: "Enter filename (without final “.3et”)",
    error_response: "Error response from server:",
    feature: "Feature",
    feature_prompt: "Feature:",
    feature_specification: "Feature specification",
    features: "Features",
    file_exists_overwrite: "The file already exists. Do you want to replace it?",
    fixed_questions: "Fixed number of questions (set to 0 to let student choose):",
    friendly_featsel_prompt: "Friendly feature selector:",
    gloss_limit: "Gloss limit",
    gloss_limit_prompt: "Limit glosses to words with a frequency rank value above this:",
    glosses: "Glosses",
    high_value_prompt: "High value:",
    import_button: "Import",
    import_shebanq: "Import from SHEBANQ",
    limited: "Limited",
    low_value_prompt: "Low value:",
    may_locate: "Show “Locate” choice in the exercise",
    missing_filename: "Missing filename",
    mql_featsel_prompt: "MQL feature selector:",
    mql_qosel_prompt: "MQL statement to select sentences:",
    multiple_choice: "Multiple choice",
    no: "No",
    not_integer: "Not an integer",
    no_focus: "SHEBANQ query does not contain any objects with FOCUS that can be used for sentence unit selection.",
    no_passages: "No passages selected",
    no_request_feature: "No request features specified",
    no_show_feature: "No show features specified",
    OK_button: "OK",
    omit_qere: "Omit qere/ketiv cases",
    order: "Order",
    overwrite: "Overwrite?",
    passage_selection: "Passage selection",
    passages: "Passages",
    question_order: "Order of questions:",
    question_order_fixed: "Fixed",
    question_order_random: "Random",
    request: "Request",
    save_button: "Save",
    sentence_selection_imported: "Sentence selection imported.",
    sentence_unit_type_prompt: "Sentence unit type:",
    sentence_units: "Sentence Units",
    sentences: "Sentences",
    sent_after: "After:",
    sent_before: "Before:",
    set_all: "Set all",
    set_aramaic: "Aramaic",
    set_hebrew: "Hebrew",
    show: "Show",
    show_only_options: "Show these options to student",
    specify_file_name: "Specify File Name",
    timer: "Timer",
    unlimited: "Unlimited",
    use_for_qosel: "Also use this for sentence unit selection",
    use_qo_selection: "Do you also wish to use {0} for sentence unit selection?",
    verb_class: "Verb class",
    verb_class_dont_care: "Don't care",
    verb_class_no: "No",
    verb_class_yes: "Yes",
    visual: "Text",
    yes: "Yes",
  });
}

// ---------------------------------------------------------------------------
// Payload de la página del editor (edit_quiz / new_quiz)
// ---------------------------------------------------------------------------

export interface QuizEditorDataPayload {
  decoded_3et_json: string;
  dbinfo_json: string;
  l10n_json: string;
  l10n_js_json: string;
  typeinfo_json: string;
  tree_data: string;
  markedList: string[];
  prop: string;
  dir: string;
  quiz: string | null;
  is_new: boolean;
  order_features: string[];
  time_seconds: number;
  is_unlimited: boolean;
}

/** Forma legacy del JSON del editor para un QuizTemplate. */
function legacyQuizJson(t: QuizTemplate): string {
  return JSON.stringify({
    desc: t.desc,
    database: t.database,
    properties: t.properties,
    selectedPaths: t.selectedPaths,
    sentenceSelection: editorMqlDataOf(t.sentenceSelection),
    quizObjectSelection: editorMqlDataOf(t.quizObjectSelection),
    quizFeatures: editorQuizFeaturesOf(t.quizFeatures),
    maylocate: t.maylocate,
    sentbefore: t.sentbefore,
    sentafter: t.sentafter,
    fixedquestions: t.fixedquestions,
    randomize: t.randomize,
  });
}

/** Convierte el JSON del editor (forma legacy) a QuizTemplate para guardar/testar. */
export function editorJsonToTemplate(quizJson: unknown): QuizTemplate {
  const q = quizJson as {
    desc?: string;
    database?: string;
    properties?: string;
    selectedPaths?: string[];
    sentenceSelection?: { object?: string; mql?: string | null; featHand?: { vhand?: unknown[] } | null; useForQo?: boolean };
    quizObjectSelection?: { object?: string; mql?: string | null; featHand?: { vhand?: unknown[] } | null; useForQo?: boolean };
    quizFeatures?: {
      showFeatures?: string[];
      requestFeatures?: { name?: string; usedropdown?: boolean; hideFeatures?: string[] | null; order_val?: string }[];
      dontShowFeatures?: string[];
      dontShowObjects?: { content?: string; show?: string }[];
      glosslimit?: number;
    };
    maylocate?: boolean;
    sentbefore?: number;
    sentafter?: number;
    fixedquestions?: number;
    randomize?: boolean;
  };

  // Los handlers que llegan del cliente ya están en formato de plantilla
  // (serializados por el editor); solo se leen sus campos al escribir el XML.
  const vhandOf = (vhand: unknown[] | undefined | null) => vhand as EditorFeatureHandler[];

  const template: QuizTemplate = {
    desc: q.desc ?? "",
    database: q.database ?? "",
    properties: q.properties ?? "",
    selectedPaths: q.selectedPaths ?? [],
    sentenceSelection: wireMqlDataOf({
      object: q.sentenceSelection?.object ?? "",
      mql: q.sentenceSelection?.mql ?? null,
      featHand: q.sentenceSelection?.featHand?.vhand ? { vhand: vhandOf(q.sentenceSelection.featHand.vhand) } : null,
      useForQo: q.sentenceSelection?.useForQo ?? false,
    }),
    quizObjectSelection: wireMqlDataOf({
      object: q.quizObjectSelection?.object ?? "",
      mql: q.quizObjectSelection?.mql ?? null,
      featHand: q.quizObjectSelection?.featHand?.vhand ? { vhand: vhandOf(q.quizObjectSelection.featHand.vhand) } : null,
      useForQo: q.quizObjectSelection?.useForQo ?? false,
    }),
    quizFeatures: wireQuizFeaturesOf({
      showFeatures: q.quizFeatures?.showFeatures ?? [],
      requestFeatures: (q.quizFeatures?.requestFeatures ?? []).map((rf) => ({
        name: rf.name ?? "",
        usedropdown: rf.usedropdown ?? false,
        hideFeatures: rf.hideFeatures ?? null,
        ...(rf.order_val !== undefined ? { order_val: rf.order_val } : {}),
      })),
      dontShowFeatures: q.quizFeatures?.dontShowFeatures ?? [],
      dontShowObjects: (q.quizFeatures?.dontShowObjects ?? []).map((d) => ({
        content: d.content ?? "",
        ...(d.show !== undefined ? { show: d.show } : {}),
      })),
      glosslimit: q.quizFeatures?.glosslimit ?? 0,
    }),
    maylocate: q.maylocate ?? true,
    sentbefore: q.sentbefore ?? 0,
    sentafter: q.sentafter ?? 0,
    fixedquestions: q.fixedquestions ?? 0,
    randomize: q.randomize ?? true,
  };

  // Ctrl_text guarda el template; el XML writer recibe selectedPaths tal cual
  if (template.fixedquestions < 0) template.fixedquestions = 0;
  return template;
}

/** time_seconds + is_unlimited de bol_exerciseowner (1:1 con edit_quiz). */
function timeLimitOf(relativePath: string): { time_seconds: number; is_unlimited: boolean } {
  const row = getAppDb()
    .prepare("SELECT time_seconds FROM bol_exerciseowner WHERE pathname = ?")
    .get(relativePath) as { time_seconds: number | null } | undefined;
  if (!row || row.time_seconds === null) return { time_seconds: 0, is_unlimited: true };
  return { time_seconds: row.time_seconds, is_unlimited: false };
}

/** edit_quiz / new_quiz: datos de la página del editor. */
export function quizEditorData(opts: {
  quiz: string | null;
  dir: string | null;
  db: string | null;
}): QuizEditorDataPayload {
  const l10n_js_json = getL10nJsJson();

  if (opts.quiz !== null && opts.quiz !== "") {
    // ---- edit_quiz ---------------------------------------------------------
    const decoded = decodeQuiz(opts.quiz);
    const handle = getEmdros(decoded.properties);
    const { tree_data, markedList, prop } = showQuizUniverse(opts.quiz, "Everything");
    const { time_seconds, is_unlimited } = timeLimitOf(opts.quiz);
    return {
      decoded_3et_json: legacyQuizJson(decoded),
      dbinfo_json: handle.dbconfig.dbinfo_json,
      l10n_json: handle.dbconfig.l10n_json,
      l10n_js_json,
      typeinfo_json: handle.dbconfig.typeinfo_json,
      tree_data,
      markedList,
      prop,
      dir: opts.quiz.replace(/\/[^/]+$/, ""),
      quiz: opts.quiz.replace(/\.3et$/, "").replace(/^.*\//, ""),
      is_new: false,
      order_features: decoded.quizFeatures.requestFeatures.map((rf) => rf.name),
      time_seconds,
      is_unlimited,
    };
  }

  // ---- new_quiz ------------------------------------------------------------
  const db = opts.db ?? "";
  if (db === "" || opts.dir === null) throw new QuizError("missing_database_name");
  const decoded = JSON.parse(newQuiz(db)) as QuizTemplate;
  const handle = getEmdros(db);
  const { tree_data, prop } = universeFor(db, [], "Everything");
  return {
    decoded_3et_json: JSON.stringify(decoded),
    dbinfo_json: handle.dbconfig.dbinfo_json,
    l10n_json: handle.dbconfig.l10n_json,
    l10n_js_json,
    typeinfo_json: handle.dbconfig.typeinfo_json,
    tree_data,
    markedList: [],
    prop,
    dir: opts.dir,
    quiz: null,
    is_new: true,
    order_features: [],
    time_seconds: 0,
    is_unlimited: true,
  };
}

// ---------------------------------------------------------------------------
// check_submit_quiz / submit_quiz / test_quiz
// ---------------------------------------------------------------------------

/** Límite de tiempo del formulario (1:1 con submit_quiz/test_quiz). */
export function calcTimeLimit(minutes: number, seconds: number): number {
  const buffer = 3; // 3 seconds buffer to allow for page to load
  const time_limit = minutes * 60 + seconds;
  if (time_limit === 0) return -1;
  return time_limit + buffer;
}

export type CheckNameStatus = "OK" | "EXISTS" | "BADNAME";

/** check_submit_quiz: ID de un nombre de ejercicio, o mensaje de error. */
export function checkQuizName(dir: string, quiz: string, me: UserRow): { status: CheckNameStatus } | { error: string } {
  const dirname = decodeURIComponent(dir);
  const quizname = decodeURIComponent(quiz);

  if (/[/?*;{}"'\\]/.test(quizname)) return { status: "BADNAME" };

  const qp = createQuizPath(false);
  qp.init(`${dirname}/${quizname}.3et`, false, false, [], false);

  if (qp.fileExists()) {
    const owner = qp.getExerciseOwner();
    if (owner !== (me.id ?? 0) && !isAdmin(me)) return { error: "You are not the owner of this file" };
    return { status: "EXISTS" };
  }
  return { status: "OK" };
}

/** submit_quiz: guarda el ejercicio y el límite de tiempo. */
export function submitQuiz(
  opts: { dir: string; quiz: string; quizdata: string; minutes: number; seconds: number; me: UserRow },
): { ok: true; dir: string } {
  const time_limit = calcTimeLimit(opts.minutes, opts.seconds);

  const qp = createQuizPath(false);
  const quizRel = `${decodeURIComponent(opts.dir)}/${decodeURIComponent(opts.quiz)}.3et`;
  qp.init(quizRel, false, false, [], false);

  // Protect against malicious posting:
  if (qp.fileExists()) {
    const owner = qp.getExerciseOwner();
    if (owner !== (opts.me.id ?? 0) && !isAdmin(opts.me)) throw new QuizError("not_owner");
  }

  const template = editorJsonToTemplate(JSON.parse(opts.quizdata));
  saveQuiz(template, qp.getAbsolute());
  qp.setOwner(opts.me.id ?? 0, time_limit);

  return { ok: true, dir: opts.dir };
}

/** test_quiz: empaqueta el ejercicio, lo guarda y arranca la vista de test. */
export function testQuiz(
  opts: { dir: string; quiz: string; quizdata: string; minutes: number; seconds: number; me: UserRow },
): { ok: true; quizPath: string } {
  const time_limit = calcTimeLimit(opts.minutes, opts.seconds);

  const qp = createQuizPath(false);
  const quizRel = `${decodeURIComponent(opts.dir)}/${decodeURIComponent(opts.quiz)}.3et`;
  qp.init(quizRel, false, false, [], false);

  const template = editorJsonToTemplate(JSON.parse(opts.quizdata));
  packageTestQuiz(template, qp.getAbsolute());
  qp.setOwner(opts.me.id ?? 0, time_limit);

  return { ok: true, quizPath: quizRel };
}