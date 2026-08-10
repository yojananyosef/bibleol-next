// -*- js -*-
// quizdata.ts — port de BibleOL/ts/quizdata.ts (puro, sin DOM).

import type { SentenceGrammarItem } from "../lib/reader/sentencegrammar.ts";
import { getFeatureSetting } from "./configuration.ts";

/** id2FeatVal: mapa id_d → features del objeto de pregunta (util.str2strArr). */
export type str2strArr = { [key: string]: string | string[] | null };

/** Datos de un ejercicio (generados por el servidor). */
export interface QuizData {
  quizid: number;
  quizFeatures: ExtendedQuizFeatures;
  desc: string;
  maylocate: boolean;
  sentbefore: number;
  sentafter: number;
  fixedquestions: number;
  randomize: boolean;
  monad2Id: number[];
  id2FeatVal: str2strArr[]; // Índice por id_d (como el legacy: util.str2strArr[])
}

export interface ExtendedQuizFeatures {
  showFeatures: string[];
  requestFeatures: { name: string; usedropdown: boolean; hideFeatures: string[] }[];
  dontShowFeatures: string[];
  dontShowObjects: { content: string; show?: string }[];
  objectType: string;
  hideWord: boolean;
  glosslimit: number;
  useVirtualKeyboard: boolean;
}

let inQuiz = false;
let quizdata: QuizData | null = null;

export function initQuizData(qd: QuizData, quiz: boolean): void {
  quizdata = qd;
  inQuiz = quiz;
}

export function getQuizData(): QuizData {
  if (!quizdata) throw new Error("legacy-ts: quizdata not initialized");
  return quizdata;
}

export function isInQuiz(): boolean {
  return inQuiz;
}

/**
 * mayShowFeature(): determina si el cliente puede mostrar una feature.
 * Port 1:1 de BibleOL/ts/quizdata.ts.
 */
export function mayShowFeature(
  oType: string,
  origOtype: string,
  feat: string,
  sgiObj: SentenceGrammarItem,
): boolean {
  if (!inQuiz) return true;

  const qf = quizdata!.quizFeatures;

  function isDontShowFeature(): boolean {
    for (const dsf of qf.dontShowFeatures) if (dsf === feat) return true;
    return false;
  }

  function isDontShowObject(): boolean {
    for (const dso of qf.dontShowObjects) if (dso.content === origOtype) return true;
    return false;
  }

  if (isDontShowFeature()) return false;

  // Metafeatures: todos sus componentes deben ser mostrables
  if (sgiObj.mytype === "GrammarMetaFeature" && !isDontShowObject()) {
    for (const it of sgiObj.items ?? []) {
      if (!mayShowFeature(oType, origOtype, it.name!, it)) return false;
    }
    return true;
  }

  const regexFeat = new RegExp(
    sgiObj.mytype === "GrammarFeature" && getFeatureSetting(oType, feat).isGloss !== undefined
      ? "\\bglosses\\b" // En dontShowObjects buscamos "glosses" en lugar de "english" etc.
      : `\\b${feat}\\b`,
  );

  for (const dso of qf.dontShowObjects)
    if (dso.content === origOtype)
      return dso.show !== undefined && Boolean(dso.show.match(regexFeat));

  if (oType !== qf.objectType) return true;

  for (const rf of qf.requestFeatures) if (rf.name === feat) return false;

  return qf.dontShowFeatures.indexOf(feat) === -1;
}
