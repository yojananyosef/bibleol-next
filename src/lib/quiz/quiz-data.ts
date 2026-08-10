/**
 * quiz/quiz-data.ts — Réplica 1:1 de `libraries/Quiz_data.php` (versión
 * actual del repo): getFeatureSetting(), ExtendedQuizFeatures y Quiz_data
 * (normalize, getCandidateSheaf, getNextCandidate, fetchBookLimit).
 *
 * Dependencias inyectadas (mql, dbinfo, charSet, makeDictionary) en vez del
 * $CI global del legacy.
 */

import { Dictionary, type DictionaryParams } from "../corpus/dictionary.ts";
import type { FeatureSetting, Dbinfo } from "../corpus/db-config.ts";
import type { IndirectFsetting } from "../corpus/lexicon.ts";
import type { Mql } from "../corpus/mql.ts";
import { OlMonadSet } from "../corpus/monads.ts";
import type { OlSheaf } from "../corpus/sheaf.ts";
import { findSuggestions } from "./suggest.ts";
import type { DontShowObject, RequestFeature } from "./template-parser.ts";

// ---------------------------------------------------------------------------
// getFeatureSetting()
// ---------------------------------------------------------------------------

/** getFeatureSetting($otype, $feature) — settings del dbinfo (visual → superficie). */
export function getFeatureSetting(dbinfo: Dbinfo, oType: string, feature: string): FeatureSetting {
  if (feature === "visual") {
    oType = dbinfo.objHasSurface;
    feature = dbinfo.surfaceFeature;
  }
  const fs = dbinfo.objectSettings[oType]?.featuresetting?.[feature];
  if (!fs) throw new Error(`getFeatureSetting: unknown feature '${feature}' for object type '${oType}'`);
  return fs;
}

// ---------------------------------------------------------------------------
// ExtendedQuizFeatures
// ---------------------------------------------------------------------------

export class ExtendedQuizFeatures {
  showFeatures: string[];
  requestFeatures: RequestFeature[];
  dontShowFeatures: string[];
  dontShowObjects: DontShowObject[];
  objectType: string;
  hideWord: boolean;
  glosslimit: number;
  useVirtualKeyboard: boolean;
  useDropdown: boolean;
  additionalFeatures: string[] | undefined;
  /** All showfeatures and requestfeatures (excluding 'visual') and additionalFeatures. */
  allFeatures: string;
  pseudoFeatures: string[];

  constructor(
    dbinfo: Dbinfo,
    sf: string[],
    rf: RequestFeature[],
    dsf: string[],
    dso: DontShowObject[],
    oType: string,
    glosslim: number,
  ) {
    this.showFeatures = sf;
    this.requestFeatures = rf;
    this.dontShowFeatures = dsf;
    this.dontShowObjects = dso;
    this.objectType = oType;
    this.hideWord = false;
    this.glosslimit = glosslim;
    this.useVirtualKeyboard = false;
    this.useDropdown = false;

    // In this array the index will be equal to the value, thus emulating a set
    const all: Record<string, string> = {};
    this.pseudoFeatures = [];

    for (const f of sf) {
      const gfs = getFeatureSetting(dbinfo, oType, f);
      if (gfs.sqlargs) {
        this.pseudoFeatures.push(f);
        for (const sqlarg of gfs.sqlargs) all[sqlarg] = sqlarg;
      } else if (f !== "visual") {
        all[f] = f;
      }
    }

    for (const f of rf) {
      const gfs = getFeatureSetting(dbinfo, oType, f.name);
      if (gfs.sqlargs) {
        this.pseudoFeatures.push(f.name);
        for (const sqlarg of gfs.sqlargs) all[sqlarg] = sqlarg;
      } else if (f.name !== "visual") {
        all[f.name] = f.name;
      }

      if (gfs.hideWord) this.hideWord = true;
      if (gfs.foreignText) this.useVirtualKeyboard = true;

      if (f.usedropdown) this.useDropdown = true;
    }

    if (dsf.includes("visual"))
      // If 'visual' is set to dontShow, we must replace text by (number)
      this.hideWord = true;

    const additional = (dbinfo.objectSettings[oType] as { additionalfeatures?: string[] }).additionalfeatures;
    if (additional) {
      this.additionalFeatures = additional;
      for (const f of additional) all[f] = f;
    }

    this.allFeatures = Object.keys(all).join(",");
  }

  /** json_encode del objeto PHP (propiedades públicas). */
  toJSON() {
    return {
      showFeatures: this.showFeatures,
      requestFeatures: this.requestFeatures,
      dontShowFeatures: this.dontShowFeatures,
      dontShowObjects: this.dontShowObjects,
      objectType: this.objectType,
      hideWord: this.hideWord,
      glosslimit: this.glosslimit,
      useVirtualKeyboard: this.useVirtualKeyboard,
      useDropdown: this.useDropdown,
      additionalFeatures: this.additionalFeatures ?? null,
      allFeatures: this.allFeatures,
      pseudoFeatures: this.pseudoFeatures,
    };
  }
}

// ---------------------------------------------------------------------------
// Quiz_data
// ---------------------------------------------------------------------------

export interface QuizDataParams {
  quizid: number;
  universe: OlMonadSet;
  senSelect: string;
  qoSelect: string;
  desc: string;
  maylocate: boolean;
  sentbefore: number;
  sentafter: number;
  fixedquestions: number;
  randomize: boolean;
  show_features: string[];
  request_features: RequestFeature[];
  dontshow_features: string[];
  dontshow_objects: DontShowObject[];
  glosslimit: number;
  oType: string;
}

export interface QuizDataDeps {
  mql: Mql;
  dbinfo: Dbinfo;
  charSet: string;
  makeDictionary: (params: DictionaryParams) => Dictionary;
}

/** Iteración de monads individuales de un OlMonadSet (Iterator del PHP). */
export function forEachMonad(ms: OlMonadSet, fn: (monad: number) => void): void {
  for (const seg of ms.segments) {
    for (let m = seg.low; m <= seg.high; ++m) fn(m);
  }
}

/** shuffle() de PHP (Fisher–Yates). */
export function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; --i) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export class QuizData {
  monad2Id = new Map<number, number>();
  id2FeatVal = new Map<number, Record<string, string | string[] | null>>();

  quizid: number;
  quizFeatures: ExtendedQuizFeatures;
  desc: string;
  maylocate: boolean;
  sentbefore: number;
  sentafter: number;
  fixedquestions: number;
  randomize: boolean;

  private universe: OlMonadSet;
  private mqlSentenceSelection: string;
  private oType: string;
  private mqlQuizObjectSelection: string;
  private mainSheaf: OlSheaf | null = null;
  private order: number[] = [];
  private nextCandidate = 0;
  private numberOfCandidates = 0;

  private deps: QuizDataDeps;

  constructor(params: QuizDataParams, deps: QuizDataDeps) {
    this.deps = deps;

    this.quizid = params.quizid;
    this.universe = params.universe;
    this.mqlSentenceSelection = this.normalize(params.senSelect);
    this.oType = params.oType;
    this.mqlQuizObjectSelection = this.normalize(params.qoSelect);
    this.quizFeatures = new ExtendedQuizFeatures(
      deps.dbinfo,
      params.show_features,
      params.request_features,
      params.dontshow_features,
      params.dontshow_objects,
      params.oType,
      params.glosslimit,
    );
    this.desc = params.desc;
    this.maylocate = params.maylocate;
    this.sentbefore = params.sentbefore;
    this.sentafter = params.sentafter;
    this.fixedquestions = params.fixedquestions;
    this.randomize = params.randomize;

    this.nextCandidate = 0;
  }

  /** normalize(): TONOS → OXIA para corpora griegos (1:1 con el PHP). */
  private normalize(s: string | null): string {
    if (s === null) s = "";
    if (this.deps.dbinfo.charSet === "greek") {
      s = s.normalize("NFC"); // Normalizer::FORM_C
      // Conversion to accented characters used in db
      const from = [
        "\u03ac", // GREEK SMALL LETTER ALPHA WITH TONOS
        "\u03ad", // EPSILON
        "\u03ae", // ETA
        "\u03af", // IOTA
        "\u03cc", // OMICRON
        "\u03cd", // UPSILON
        "\u03ce", // OMEGA
        "\u0390", // IOTA WITH DIALYTIKA AND TONOS
        "\u03b0", // UPSILON WITH DIALYTIKA AND TONOS
      ];
      const to = [
        "\u1f71", // ALPHA WITH OXIA
        "\u1f73", // EPSILON WITH OXIA
        "\u1f75", // ETA WITH OXIA
        "\u1f77", // IOTA WITH OXIA
        "\u1f79", // OMICRON WITH OXIA
        "\u1f7b", // UPSILON WITH OXIA
        "\u1f7d", // OMEGA WITH OXIA
        "\u1fd3", // IOTA WITH DIALYTIKA AND OXIA
        "\u1fe3", // UPSILON WITH DIALYTIKA AND OXIA
      ];
      for (let i = 0; i < from.length; ++i) s = s.split(from[i]).join(to[i]);
    }
    return s;
  }

  /** fetchBookLimit(): monadset del libro (nivel 0) que contiene a $ms. */
  private fetchBookLimit(ms: OlMonadSet): OlMonadSet {
    const emdat = this.deps.mql.exec(
      `GET OBJECTS HAVING MONADS IN ${ms} [${this.deps.dbinfo.universeHierarchy[0].type}]`,
    );
    return emdat[0].get_sheaf()!.get_straws()[0].get_matched_objects()[0].get_monadset();
  }

  /**
   * getNextCandidate(): coge $request_number frases del mainSheaf (en el orden
   * aleatorio), las expande con sentbefore/sentafter, construye el Dictionary
   * y rellena monad2Id/id2FeatVal con los objetos de pregunta. Devuelve el
   * Dictionary, o null si no quedan candidatos.
   */
  getNextCandidate(requestNumber: number): Dictionary | null {
    const remaining = this.numberOfCandidates - this.nextCandidate;
    if (requestNumber > remaining) requestNumber = remaining;
    if (requestNumber <= 0) return null;

    // Populate the dictionary with the new candidate sentences
    const msets: OlMonadSet[] = [];
    const extendedMsets: OlMonadSet[] = [];
    for (let i = 0; i < requestNumber; ++i) {
      const monadsets = this.mainSheaf!.get_monadset()!;
      const currentMs = new OlMonadSet(
        monadsets[this.order[this.nextCandidate++]].segments.map((s) => ({ ...s })),
      );
      msets.push(currentMs);

      const booklimits = this.fetchBookLimit(currentMs);

      // If both sentbefore and sentafter are 0, we must not include an embedded sentence.
      if (this.sentbefore !== 0 || this.sentafter !== 0) {
        let currentMsLow = currentMs.low();
        let currentMsHigh = currentMs.high2();

        // We reasonably assume that all of $currentMs is within the same book.
        // Add sentences before relevant sentence
        for (let sentcount = 0; sentcount < this.sentbefore && currentMsLow > booklimits.low(); ++sentcount) {
          const befset = currentMsLow - 1;
          const emdat = this.deps.mql.exec(
            `GET OBJECTS HAVING MONADS IN {{${befset}}} [${this.deps.dbinfo.granularity}] GOqxqxqx`,
          );
          currentMsLow = emdat[0].get_sheaf()!.get_straws()[0].get_matched_objects()[0].get_monadset().low();
        }

        // Add sentences after relevant sentence
        for (let sentcount = 0; sentcount < this.sentafter && currentMsHigh < booklimits.high2(); ++sentcount) {
          const aftset = currentMsHigh + 1;
          const emdat = this.deps.mql.exec(
            `GET OBJECTS HAVING MONADS IN {{${aftset}}} [${this.deps.dbinfo.granularity}] GOqxqxqx`,
          );
          currentMsHigh = emdat[0].get_sheaf()!.get_straws()[0].get_matched_objects()[0].get_monadset().high2();
        }
        const xset = new OlMonadSet();
        xset.addOne(currentMsLow, currentMsHigh);
        extendedMsets.push(xset);
      } else {
        extendedMsets.push(currentMs);
      }
    }

    const dictionary = this.deps.makeDictionary({
      msets: extendedMsets,
      msets_quiz: msets,
      inQuiz: true,
      showIcons: false,
      glosslimit: this.quizFeatures.glosslimit,
    });

    const msetUnion = new OlMonadSet();
    for (const mset of msets) msetUnion.addSetNoConsolidate(mset);

    // The "\n" in the following MQL commands is required if the user entered text
    // that ends with a comment.
    let command = "";
    if (this.quizFeatures.allFeatures === "")
      command += `SELECT All OBJECTS IN ${msetUnion} WHERE [${this.oType} ${this.mqlQuizObjectSelection}\n] GOqxqxqx\n`;
    else
      command += `SELECT All OBJECTS IN ${msetUnion} WHERE [${this.oType} ${this.mqlQuizObjectSelection}\n GET ${this.quizFeatures.allFeatures}] GOqxqxqx\n`;

    const emdrosData = this.deps.mql.exec(command);
    const sh = emdrosData[0].get_sheaf()!;

    for (const str of sh.get_straws()) {
      for (const mo of str.get_matched_objects()) {
        let visual = "";
        const idD = mo.get_id_d();

        forEachMonad(mo.get_monadset(), (monad) => {
          this.monad2Id.set(monad, idD);
          visual += dictionary.getVisual(monad);
        });

        for (const psf of this.quizFeatures.pseudoFeatures)
          dictionary.indirectLookup(
            psf,
            mo,
            getFeatureSetting(this.deps.dbinfo, this.oType, psf) as IndirectFsetting,
            false,
          );

        // For simplicity, always add "visual" pseudo-feature
        mo.set_feature("visual", visual.trim());

        const feats = { ...(mo.get_features() ?? {}) } as Record<string, string | string[] | null>;
        this.id2FeatVal.set(idD, feats);
        if (this.quizFeatures.useDropdown) {
          for (const rf of this.quizFeatures.requestFeatures) {
            if (rf.usedropdown) {
              const fsetting = getFeatureSetting(this.deps.dbinfo, this.oType, rf.name);
              const row = this.id2FeatVal.get(idD)!;
              const suggestions = findSuggestions(
                fsetting.alternateshowrequestDb ?? "",
                fsetting.alternateshowrequestSql ?? "",
                String(row[this.quizFeatures.additionalFeatures?.[0] ?? ""] ?? ""), // TODO: never more than one additional feature
                String(row[rf.name] ?? ""),
                2,
                10,
              );
              row[rf.name + "!suggest!"] = suggestions;
            }
          }
        }
      }
    }
    return dictionary;
  }

  /** getCandidateSheaf(): consulta rápida de frases candidatas + orden aleatorio. */
  getCandidateSheaf(): boolean {
    const quickEmdrosData = this.deps.mql.exec(
      `SELECT ALL OBJECTS IN ${this.universe} WHERE [${this.deps.dbinfo.granularity} ${this.mqlSentenceSelection}\n] GOqxqxqx`,
      true,
    );

    this.mainSheaf = quickEmdrosData[0].get_sheaf();

    if (this.mainSheaf === null || !this.mainSheaf.has_monadset()) {
      this.numberOfCandidates = 0;
      return false;
    }

    this.numberOfCandidates = this.mainSheaf.get_monadset()!.length;
    if (this.numberOfCandidates === 0) return false;

    this.order = [];
    for (let i = 0; i < this.numberOfCandidates; ++i) this.order.push(i);
    if (this.randomize) shuffle(this.order); // Randomizes $this->order

    return true;
  }

  getNumberOfCandidates(): number {
    return this.numberOfCandidates;
  }

  /** json_encode($this->quiz_data): propiedades públicas del PHP. */
  toJSON() {
    const monad2Id: Record<string, number> = {};
    for (const [k, v] of this.monad2Id) monad2Id[String(k)] = v;
    const id2FeatVal: Record<string, Record<string, string | string[] | null>> = {};
    for (const [k, v] of this.id2FeatVal) id2FeatVal[String(k)] = v;
    return {
      monad2Id,
      id2FeatVal,
      quizid: this.quizid,
      quizFeatures: this.quizFeatures.toJSON(),
      desc: this.desc,
      maylocate: this.maylocate,
      sentbefore: this.sentbefore,
      sentafter: this.sentafter,
      fixedquestions: this.fixedquestions,
      randomize: this.randomize,
    };
  }
}