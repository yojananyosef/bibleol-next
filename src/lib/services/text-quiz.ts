/**
 * services/text-quiz.ts — Servidor de quizzes (port de Mod_askemdros +
 * Ctrl_text::show_quiz_common / show_quiz_univ / add_universe_level).
 *
 * decodeQuiz/parseQuizBasic/parseQuiz/show_quiz → payload JSON 1:1 con el
 * legacy (quizData_json, dictionaries_json, dbinfo_json, l10n_json,
 * typeinfo_json, useTooltip_str, …).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { getEmdros, type CorpusHandle } from "../corpus/emdros.ts";
import { Dictionary, type DictionaryParams } from "../corpus/dictionary.ts";
import type { Dbinfo } from "../corpus/db-config.ts";
import { OlMonadSet } from "../corpus/monads.ts";
import type { OlSheaf } from "../corpus/sheaf.ts";
import { getAppDb } from "../db/sqlite.ts";
import { harvest, featHandToMql, type QuizTemplate } from "../quiz/template-parser.ts";
import { writeQuizTemplateXml, type DbinfoForWriter } from "../quiz/template-writer.ts";
import { QuizData } from "../quiz/quiz-data.ts";
import { TreeNode, UniverseTree } from "../quiz/universe-tree.ts";
import { newQuizTemplate, startQuiz } from "./statistics.ts";

/** Error de quiz localizado (mensaje = clave de idioma). */
export class QuizError extends Error {}

/** l10nJson parseado: sección "universe" con los nombres localizados. */
type L10nUniverse = Record<string, Record<string, string>>;

// ---------------------------------------------------------------------------
// Ficheros de quiz
// ---------------------------------------------------------------------------

/** Lee el .3et y lanza QuizError('cannot_open_file') si no existe. */
export function readQuizFile(filename: string): string {
  let contents: string;
  try {
    contents = readFileSync(filename, "utf8");
  } catch {
    throw new QuizError("cannot_open_file");
  }
  if (contents === "") throw new QuizError("cannot_open_file");
  return contents;
}

/** decodeQuiz(): lee y parsea el template (.3et). */
export function decodeQuiz(filename: string): QuizTemplate {
  return harvest(readQuizFile(filename));
}

/** get_quiz_universe(): parseQuizBasic + los JSON del db_config. */
export function getQuizUniverse(quizFile: string): {
  decoded: QuizTemplate;
  handle: CorpusHandle;
  dbinfo_json: string;
  l10n_json: string;
  typeinfo_json: string;
} {
  const decoded = decodeQuiz(quizFile);
  const handle = getEmdros(decoded.properties);
  parseQuizBasic(handle, decoded);
  return {
    decoded,
    handle,
    dbinfo_json: handle.dbconfig.dbinfo_json,
    l10n_json: handle.dbconfig.l10n_json,
    typeinfo_json: handle.dbconfig.typeinfo_json,
  };
}

/** parseQuizBasic(): limpieza de gloss y normalización de paths (1:1). */
export function parseQuizBasic(handle: CorpusHandle, decoded: QuizTemplate): void {
  // Make sure glosses are not visible if a gloss language is requested
  if (decoded.quizObjectSelection.object === (JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo).objHasSurface) {
    const dbinfo = JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo;
    const fsetting = dbinfo.objectSettings[dbinfo.objHasSurface]?.featuresetting ?? {};

    // Store all gloss features in $gloss_features
    const glossFeatures: Record<string, boolean> = {};
    for (const [featname, featval] of Object.entries(fsetting)) {
      if (featval?.isGloss) glossFeatures[featname] = true;
    }

    // Set gloss_features[] to false for request, display, and "don't show" features.
    // The remainder will be the "don't care" features.
    let requestGlossFound = false;
    for (const f of decoded.quizFeatures.requestFeatures) {
      if (fsetting[f.name]?.isGloss) {
        requestGlossFound = true;
        glossFeatures[f.name] = false;
      }
    }

    if (requestGlossFound) {
      for (const f of decoded.quizFeatures.showFeatures)
        if (fsetting[f]?.isGloss) glossFeatures[f] = false;

      for (const f of decoded.quizFeatures.dontShowFeatures)
        if (fsetting[f]?.isGloss) glossFeatures[f] = false;

      // Mark the remaining gloss features as "don't show"
      for (const [f, isDontCare] of Object.entries(glossFeatures))
        if (isDontCare) decoded.quizFeatures.dontShowFeatures.push(f);
    }
  }

  // A full universe path looks like this: <path></path>. Depending on the XML
  // parser used, this may result in a path which is either array() or array('').
  if (decoded.selectedPaths.length === 0) decoded.selectedPaths = [""];
}

// ---------------------------------------------------------------------------
// parsePath
// ---------------------------------------------------------------------------

/** parsePath(): universo de las <path> del template o de la selección del usuario. */
export function parsePath(
  handle: CorpusHandle,
  paths: string[],
  useSelection: string[] | null,
): OlMonadSet {
  const dbinfo = JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo;

  if (useSelection === null) {
    // Use universe specified in quiz file
    const pathCount = paths.length;

    let command = "";
    const ms = new OlMonadSet();

    for (const p of paths) {
      if (p === "") return fullUniverse(handle); // $path = array('')

      const splitP = p.split(":");
      if (splitP.length > dbinfo.universeHierarchy.length)
        throw new QuizError("illegal_path");

      command += "SELECT ALL OBJECTS WHERE ";

      for (let i = 0; i < splitP.length; ++i)
        command += `[${dbinfo.universeHierarchy[i].type} ${dbinfo.universeHierarchy[i].type}=${splitP[i]} `;

      for (let i = 0; i < splitP.length; ++i) command += "]";

      command += " GOqxqxqx\n";
    }

    const emdrosData = handle.mql.exec(command);

    for (let i = 0; i < pathCount; ++i) {
      let sh = emdrosData[i].get_sheaf();
      if (sh === null || sh.isEmpty()) continue; // universe specification contains elements not in the corpus

      // Find lowest level of information (i.e., verse if present, else chapter if present, else book)
      let lastNonNullSheaf: OlSheaf = sh;
      for (; sh !== null; sh = sh.get_first_straw().get_first_matched_object().get_sheaf())
        lastNonNullSheaf = sh;

      ms.addSet(lastNonNullSheaf.get_first_straw().get_first_matched_object().get_monadset());
    }
    return ms;
  }

  // Use universe specified by user
  const ms = new OlMonadSet();
  for (const mysel of useSelection) {
    const splitMysel = mysel.split("/");
    if (splitMysel.length !== 3 || !isNumeric(splitMysel[1]) || !isNumeric(splitMysel[2]))
      throw new QuizError("illegal_selection");
    ms.addOne(parseInt(splitMysel[1], 10), parseInt(splitMysel[2], 10));
  }
  return ms;
}

/** fullUniverse(): MIN_M..MAX_M (Mod_askemdros::fullUniverse). */
export function fullUniverse(handle: CorpusHandle): OlMonadSet {
  const emdrosData = handle.mql.exec("SELECT MIN_M GOqxqxqx\nSELECT MAX_M GOqxqxqx\n");
  const ms = new OlMonadSet();
  ms.addOne(
    Number(emdrosData[0].get_table()!.get_cell(0, 0)),
    Number(emdrosData[1].get_table()!.get_cell(0, 0)),
  );
  return ms;
}

function isNumeric(s: string): boolean {
  return s !== "" && !Number.isNaN(Number(s));
}

/** strip_monads(): quita "/monads" de los ítems de la selección del usuario. */
export function stripMonads(useSelection: string[]): string[] {
  return useSelection.map((pathWithMonads) => pathWithMonads.replace(/\/.*/, ""));
}

// ---------------------------------------------------------------------------
// parseQuiz → QuizData
// ---------------------------------------------------------------------------

function makeDictionary(handle: CorpusHandle): (params: DictionaryParams) => Dictionary {
  const dbinfo = JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo;
  return (params) =>
    new Dictionary(params, {
      mql: handle.mql,
      dbinfo,
      l10nJson: handle.dbconfig.l10n_json,
      picdb: null, // Legacy: quiz dictionaries never load pictures
    });
}

/**
 * parseQuiz(): instancia QuizData a partir del template (estadísticas de quiz
 * incluidas si el usuario está logueado).
 */
export function parseQuiz(
  handle: CorpusHandle,
  filename: string,
  contents: string,
  decoded: QuizTemplate,
  useSelection: string[] | null,
  opts: { userid: number; loggedIn: boolean },
): QuizData {
  parseQuizBasic(handle, decoded);

  const dbinfo = JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo;

  const sentenceSelector =
    decoded.sentenceSelection.mql !== null
      ? decoded.sentenceSelection.mql
      : `[${decoded.sentenceSelection.object} NORETRIEVE ${featHandToMql(decoded.sentenceSelection.featHand)}]`;

  const qoSelector =
    decoded.quizObjectSelection.mql !== null
      ? decoded.quizObjectSelection.mql
      : featHandToMql(decoded.quizObjectSelection.featHand);

  // A full universe path looks like this: <path></path>. The following
  // statement streamlines this as array('').
  if (decoded.selectedPaths.length === 0) decoded.selectedPaths = [""];

  let quizid = -1;
  if (opts.loggedIn) {
    const templid = newQuizTemplate(
      opts.userid,
      filename,
      contents,
      decoded.database,
      decoded.properties,
      decoded.quizObjectSelection.object,
    );
    if (useSelection === null || decoded.fixedquestions > 0)
      quizid = startQuiz(opts.userid, templid, decoded.selectedPaths);
    else quizid = startQuiz(opts.userid, templid, stripMonads(useSelection));
  }

  return new QuizData(
    {
      quizid,
      universe: parsePath(handle, decoded.selectedPaths, decoded.fixedquestions > 0 ? null : useSelection),
      senSelect: sentenceSelector,
      qoSelect: qoSelector,
      desc: decoded.desc,
      maylocate: decoded.maylocate,
      sentbefore: decoded.sentbefore,
      sentafter: decoded.sentafter,
      fixedquestions: decoded.fixedquestions,
      randomize: decoded.randomize,
      show_features: decoded.quizFeatures.showFeatures,
      request_features: decoded.quizFeatures.requestFeatures,
      dontshow_features: decoded.quizFeatures.dontShowFeatures,
      dontshow_objects: decoded.quizFeatures.dontShowObjects,
      glosslimit: decoded.quizFeatures.glosslimit,
      oType: decoded.quizObjectSelection.object,
    },
    {
      mql: handle.mql,
      dbinfo,
      charSet: dbinfo.charSet ?? "",
      makeDictionary: makeDictionary(handle),
    },
  );
}

// ---------------------------------------------------------------------------
// show_quiz_common → payload
// ---------------------------------------------------------------------------

export interface ShowQuizPayload {
  is_quiz: true;
  mql_list: string;
  useTooltip_str: "true" | "false";
  quizData_json: string;
  dbinfo_json: string;
  dictionaries_json: string;
  l10n_json: string;
  l10n_js_json: string;
  typeinfo_json: string;
  is_logged_in: boolean;
  time_seconds: number | null;
  is_unlimited: boolean;
  number_of_quizzes: number;
  number_small_questions: number;
}

/** Mod_askemdros: userconfig.usetooltip (0 si no hay fila). */
function tooltipEnabledOf(userid: number): boolean {
  const db = getAppDb();
  const row = db
    .prepare("SELECT usetooltip FROM bol_userconfig WHERE user_id = ?")
    .get(userid) as { usetooltip: number } | undefined;
  return row ? row.usetooltip !== 0 : false;
}

/** Ctrl_text::show_quiz_common: límite de tiempo de bol_exerciseowner (null si no hay). */
export function getTimeSeconds(quizFile: string): number | null {
  const db = getAppDb();
  const row = db
    .prepare("SELECT time_seconds FROM bol_exerciseowner WHERE pathname = ?")
    .get(quizFile) as { time_seconds: number | null } | undefined;
  if (!row || row.time_seconds === null) return null;
  return row.time_seconds - 3; // Buffer of 3 seconds
}

/**
 * show_quiz(): ejecuta el quiz (candidatos + dictionary + pregunta) y
 * devuelve el payload JSON idéntico al de view_text_display del legacy.
 */
export function showQuiz(
  quizFile: string,
  number_of_quizzes: number,
  useSelection: string[] | null,
  opts: { userid: number; loggedIn: boolean; l10nJsJson?: string },
): ShowQuizPayload {
  const contents = readQuizFile(quizFile);
  const decoded = harvest(contents);
  const handle = getEmdros(decoded.properties);

  const quizData = parseQuiz(handle, quizFile, contents, decoded, useSelection, opts);
  if (!quizData.getCandidateSheaf()) throw new QuizError("no_sentences_found");

  if (quizData.fixedquestions > 0) number_of_quizzes = quizData.fixedquestions;
  const dictionaries = quizData.getNextCandidate(number_of_quizzes);

  const timeSeconds = opts.loggedIn ? getTimeSeconds(quizFile) : null;
  const is_unlimited = timeSeconds === null;

  return {
    is_quiz: true,
    mql_list: handle.mql.mql_list,
    useTooltip_str: opts.loggedIn && tooltipEnabledOf(opts.userid) ? "true" : "false",
    quizData_json: JSON.stringify(quizData.toJSON()),
    dbinfo_json: handle.dbconfig.dbinfo_json,
    dictionaries_json: JSON.stringify(dictionaries?.toJSON() ?? null),
    l10n_json: handle.dbconfig.l10n_json,
    l10n_js_json: opts.l10nJsJson ?? "{}",
    typeinfo_json: handle.dbconfig.typeinfo_json,
    is_logged_in: opts.loggedIn,
    time_seconds: timeSeconds,
    is_unlimited,
    number_of_quizzes,
    number_small_questions: quizData.id2FeatVal.size,
  };
}

// ---------------------------------------------------------------------------
// Editor de ejercicios (new_quiz / edit_quiz / package / save / test)
// ---------------------------------------------------------------------------

/** edit_quiz(): parseQuizBasic + los JSON del db_config (sin universo). */
export function editQuiz(quizFile: string): {
  decoded: QuizTemplate;
  handle: CorpusHandle;
  dbinfo_json: string;
  l10n_json: string;
  typeinfo_json: string;
} {
  const { decoded, handle, dbinfo_json, l10n_json, typeinfo_json } = getQuizUniverse(quizFile);
  return { decoded, handle, dbinfo_json, l10n_json, typeinfo_json };
}

/** new_quiz($db): plantilla por defecto para un corpus (JSON igual al legacy). */
export function newQuiz(db: string): string {
  const handle = getEmdros(db);
  const dbinfo = JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo;
  return (
    `{"desc":"",` +
    `"database":"${dbinfo.databaseName}",` +
    `"properties":"${db}",` +
    `"selectedPaths":[],` +
    `"sentenceSelection":{"object":"${dbinfo.objHasSurface}","mql":null,"featHand":{"vhand":[]},"useForQo":true},` +
    `"quizObjectSelection":{"object":"word","mql":null,"featHand":{"vhand":[]},"useForQo":true},` +
    `"quizFeatures":{"showFeatures":[],"requestFeatures":[],"dontShowFeatures":[],"dontShowObjects":[],"glosslimit":0},` +
    `"maylocate":true,` +
    `"sentbefore":0,` +
    `"sentafter":0,` +
    `"fixedquestions":0,` +
    `"randomize":true` +
    `}`
  );
}

/** Template::writeAsXml($quizdata, $dbinfo) — serialización a XML .3et. */
export function writeQuizXml(quizdata: QuizTemplate, handle: CorpusHandle): string {
  const dbinfo = JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo & DbinfoForWriter;
  return writeQuizTemplateXml(quizdata, dbinfo);
}

/** package_test_quiz(): escribe el XML en el fichero y devuelve el contenido. */
export function packageTestQuiz(quizdata: QuizTemplate, quizFile: string): string {
  const handle = getEmdros(quizdata.properties);
  const res = writeQuizXml(quizdata, handle);
  try {
    writeFileSync(quizFile, res, "utf8");
  } catch {
    throw new QuizError("cannot_write_to_quiz_file");
  }
  return res;
}

/** save_quiz(): escribe el XML en el fichero (sin devolver nada). */
export function saveQuiz(quizdata: QuizTemplate, quizFile: string): void {
  const handle = getEmdros(quizdata.properties);
  const res = writeQuizXml(quizdata, handle);
  try {
    writeFileSync(quizFile, res, "utf8");
  } catch {
    throw new QuizError("cannot_write_to_quiz_file");
  }
}

/**
 * show_test_quiz(): como show_quiz pero sobre el fichero recién empaquetado
 * (Ctrl_text::test_quiz: package_test_quiz + set_owner + show_test_quiz).
 */
export function showTestQuiz(
  quizFile: string,
  number_of_quizzes: number,
  useSelection: string[] | null,
  opts: { userid: number; loggedIn: boolean; l10nJsJson?: string },
): ShowQuizPayload {
  return showQuiz(quizFile, number_of_quizzes, useSelection, opts);
}

// ---------------------------------------------------------------------------
// Árbol de universo (jstree)
// ---------------------------------------------------------------------------

function l10nUniverseOf(handle: CorpusHandle): L10nUniverse | undefined {
  try {
    return (JSON.parse(handle.dbconfig.l10n_json) as { universe?: L10nUniverse }).universe;
  } catch {
    return undefined;
  }
}

/**
 * show_quiz_univ(): árbol del universo con los paths del template marcados
 * (para el seleccionador de pasajes previo al quiz).
 */
export function showQuizUniverse(quizFile: string, everythingLabel: string): {
  tree_data: string;
  markedList: string[];
  db: string;
  prop: string;
  dbinfo_json: string;
  l10n_json: string;
  typeinfo_json: string;
} {
  const { decoded, handle } = getQuizUniverse(quizFile);
  const tree = new UniverseTree(
    { markedList: decoded.selectedPaths },
    { handle, dbinfo: JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo, everythingLabel, l10nUniverse: l10nUniverseOf(handle) },
  );
  return {
    tree_data: tree.get_jstree(),
    markedList: decoded.selectedPaths,
    db: handle.databaseName,
    prop: handle.prop,
    dbinfo_json: handle.dbconfig.dbinfo_json,
    l10n_json: handle.dbconfig.l10n_json,
    typeinfo_json: handle.dbconfig.typeinfo_json,
  };
}

/**
 * add_universe_level(): expansión perezosa de un nivel del árbol
 * (GET /quiz/universe-level?rangelow=…&rangehigh=…&ref=…&lev=…).
 */
export function addUniverseLevel(
  prop: string,
  rangelow: number,
  rangehigh: number,
  ref: string,
  lev: number,
  everythingLabel: string,
): string {
  const handle = getEmdros(prop);
  const tree = new UniverseTree(null, {
    handle,
    dbinfo: JSON.parse(handle.dbconfig.dbinfo_json) as Dbinfo,
    everythingLabel,
    l10nUniverse: l10nUniverseOf(handle),
  });
  const nodes: TreeNode[] = tree.expandLevel(rangelow, rangehigh, ref, lev);
  return JSON.stringify(nodes.map((n) => n.toJSON()));
}