/**
 * reader/grammar-info.ts — Port de `toolTipFunc` (BibleOL/ts/dictionary.ts) y
 * de los helpers de configuración que usa (configuration.ts, quizdata.ts).
 *
 * Genera la tabla de información gramatical de un objeto del Dictionary:
 * cabecera con el nombre del tipo de objeto, la fila "visual" (surface) y una
 * fila por feature según el sentencegrammar del nivel, con nombres y valores
 * localizados (los valores los localiza el walker de sentencegrammar.ts).
 */

import type { FeatureMap, ReaderL10n, ReaderTypeInfo, SentenceGrammar, SentenceGrammarItem } from "./sentencegrammar.ts";
import { WHAT } from "./sentencegrammar.ts";

export interface FeatureSettingLite {
  foreignText?: boolean;
  transliteratedText?: boolean;
}

/** getObjectSetting → featuresetting del objeto (configuration.ts). */
export function getObjectSetting(
  objectSettings: Record<string, { featuresetting?: Record<string, FeatureSettingLite> }>,
  otype: string,
): { featuresetting?: Record<string, FeatureSettingLite> } {
  return objectSettings[otype];
}

/** getFeatureSetting (configuration.ts): con pseudo-feature 'visual'. */
export function getFeatureSetting(
  objectSettings: Record<string, { featuresetting?: Record<string, FeatureSettingLite> }>,
  objHasSurface: string,
  surfaceFeature: string,
  otype: string,
  feature: string,
): FeatureSettingLite {
  let ot = otype;
  let f = feature;
  if (f === "visual") {
    ot = objHasSurface;
    f = surfaceFeature;
  }
  const io = f.indexOf("_TYPE_");
  if (io !== -1) f = f.substring(0, io);
  return getObjectSetting(objectSettings, ot).featuresetting?.[f] ?? {};
}

/** mayShowFeature (quizdata.ts): sin quiz todas las features se muestran. */
export function mayShowFeature(
  _oType: string,
  _origOtype: string,
  _feat: string,
  _sgiObj: SentenceGrammarItem,
  inQuiz = false,
): boolean {
  if (!inQuiz) return true;
  // El resto del port (quiz) llega en la Fase 5.
  return true;
}

/** getObjectFriendlyName (localization.ts). */
export function getObjectFriendlyName(l10n: ReaderL10n, otype: string): string {
  if (otype === "Patriarch") return otype;
  const fn = l10n.emdrosobject[otype]?._objname;
  return fn ? fn : otype;
}

/** getObjectShortFriendlyName (localization.ts). */
export function getObjectShortFriendlyName(l10n: ReaderL10n, otype: string): string {
  const abbrev = l10n.emdrosobject[`${otype}_abbrev`];
  if (abbrev === undefined) return getObjectFriendlyName(l10n, otype);
  return abbrev._objname ?? otype;
}

// ─────────────────────────────────────────────────────────────────────────────
// toolTipFunc (dictionary.ts) — tabla de información gramatical
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de la tabla de gramática. */
export interface GrammarInfoRow {
  kind: "head" | "visual" | "feature" | "metafeature" | "groupstart" | "groupend";
  label: string | null;
  value: string;
  /** Clase de fuente: extranjera (hebreo/griego) o transliterada. */
  valueClass: "foreign" | "transliterated" | "";
  /** El valor contiene HTML (enlaces 'url'). */
  valueIsHtml: boolean;
}

/**
 * Genera la información gramatical de un objeto (equivalente a toolTipFunc).
 *
 * @param sengram  SentenceGrammar del nivel del objeto.
 * @param features Features del objeto (del JSON del Dictionary).
 * @param l10n     Localización del corpus.
 * @param typeinfo Typeinfo del corpus.
 * @param config   objectSettings + objHasSurface + surfaceFeature del dbinfo.
 * @param opts     visualText: fila "visual" con el texto del objeto.
 */
export function grammarInfoTable(
  sengram: SentenceGrammar,
  features: FeatureMap,
  l10n: ReaderL10n,
  typeinfo: ReaderTypeInfo,
  config: {
    objectSettings: Record<string, { featuresetting?: Record<string, FeatureSettingLite> }>;
    objHasSurface: string;
    surfaceFeature: string;
  },
  opts: { setHead: boolean; hideWord: boolean; visualText?: string },
): { rows: GrammarInfoRow[]; heading: string } {
  const rows: GrammarInfoRow[] = [];
  const { objectSettings, objHasSurface, surfaceFeature } = config;

  const head = getObjectFriendlyName(l10n, sengram.objType);
  if (opts.setHead) rows.push({ kind: "head", label: null, value: head, valueClass: "", valueIsHtml: false });

  if (sengram.objType === "word" && !opts.hideWord) {
    rows.push({
      kind: "visual",
      label: "visual",
      value: opts.visualText ?? features[surfaceFeature] ?? "",
      valueClass: "foreign",
      valueIsHtml: false,
    });
  }

  const map = new Map<string, string>(); // feature name → nombre localizado

  sengram.walkFeatureNames(sengram.objType, l10n, (whattype, objType, _origObjType, featName, featNameLoc) => {
    if (whattype === WHAT.feature || whattype === WHAT.metafeature)
      if (!mayShowFeature(objType, objType, featName, { mytype: "", name: featName } as SentenceGrammarItem)) return;
    if (whattype === WHAT.feature || whattype === WHAT.metafeature || whattype === WHAT.groupstart)
      if (featNameLoc !== null) map.set(featName, featNameLoc);
  });

  sengram.walkFeatureValues(features, 0, sengram.objType, false, l10n, typeinfo, (whattype, objType, _origObjType, featName, featValLoc, sgiObj) => {
    switch (whattype) {
      case WHAT.feature: {
        if (!mayShowFeature(objType, objType, featName, sgiObj)) break;
        const fs = getFeatureSetting(objectSettings, objHasSurface, surfaceFeature, objType, featName);
        const valueClass: GrammarInfoRow["valueClass"] =
          featValLoc === "-" ? "" : fs.foreignText ? "foreign" : fs.transliteratedText ? "transliterated" : "";
        const isHtml = featValLoc.startsWith("<a ") && featValLoc.endsWith(">");
        rows.push({
          kind: "feature",
          label: map.get(featName) ?? featName,
          value: featValLoc,
          valueClass,
          valueIsHtml: isHtml,
        });
        break;
      }
      case WHAT.metafeature:
        if (!mayShowFeature(objType, objType, featName, sgiObj)) break;
        rows.push({
          kind: "metafeature",
          label: map.get(featName) ?? featName,
          value: featValLoc,
          valueClass: "",
          valueIsHtml: false,
        });
        break;
      case WHAT.groupstart:
        rows.push({
          kind: "groupstart",
          label: map.get(featName) ?? featName,
          value: "",
          valueClass: "",
          valueIsHtml: false,
        });
        break;
      case WHAT.groupend:
        break;
    }
  });

  return { rows, heading: head };
}
