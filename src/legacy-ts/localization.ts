// -*- js -*-
// localization.ts — port de BibleOL/ts/localization.ts + localization_general.ts
// (puro, sin DOM). Los datos (l10n, l10n_js) se inyectan con init().

import { StringWithSort } from "./stringwithsort.ts";

/** typeValues: rango localizado de valores. */
export interface typeValues {
  first: number;
  last: number;
  text: string;
}

/** Localization: strings localizadas de un corpus (l10n). */
export interface Localization {
  dbdescription: string;
  dbcopyright: string;
  emdrosobject: {
    [objType: string]: {
      _objname: string;
      [featureValue: string]: string | typeValues[] | undefined;
    };
  };
  emdrostype: {
    [enumType: string]: {
      [enumValue: string]: string;
    };
  };
  grammargroup?: { [objType: string]: { [groupValue: string]: string } };
  grammarfeature?: { [objType: string]: { [featureValue: string]: string } };
  grammarmetafeature?: { [objType: string]: { [featureValue: string]: string } };
  grammarsubfeature?: {
    [objType: string]: { [featureName: string]: { [featureValue: string]: string } };
  };
  universe: {
    [objType: string]: {
      _label: string;
      [featurevalue: string]: string;
    };
  };
}

/** Localization_general: strings localizadas de la interfaz (l10n_js). */
export interface LocalizationGeneral {
  [key: string]: string;
}

let l10n: Localization | null = null;
let l10nJs: LocalizationGeneral = {};

/** Inicializa los datos de localización (llamado al cargar un quiz/texto). */
export function initLocalization(l10nData: Localization, l10nJsData: LocalizationGeneral = {}): void {
  l10n = l10nData;
  l10nJs = l10nJsData;
}

export function isLocalizationInitialized(): boolean {
  return l10n !== null;
}

/** localize(): busca una string de la interfaz ('??key??' si no existe). */
export function localize(s: string): string {
  const str = l10nJs[s];
  return str === undefined ? `??${s}??` : str;
}

export function getObjectFriendlyName(otype: string): string {
  if (otype === "Patriarch") return otype; // Shouldn't happen
  const fn = l10n?.emdrosobject[otype]?._objname;
  return fn ? fn : otype;
}

export function getObjectShortFriendlyName(otype: string): string {
  if (l10n?.emdrosobject[`${otype}_abbrev`] === undefined) return getObjectFriendlyName(otype);
  return l10n.emdrosobject[`${otype}_abbrev`]._objname;
}

export function getFeatureFriendlyName(otype: string, feature: string): string {
  if (feature === "visual") return localize("visual");
  const fn = l10n?.emdrosobject[otype]?.[feature];
  return typeof fn === "string" && fn ? fn : feature;
}

export function getFeatureValueFriendlyName(
  featureType: string,
  value: string,
  abbrev: boolean,
  doStripSort: boolean,
): string {
  const l = l10n ?? { emdrosobject: {}, emdrostype: {} } as unknown as Localization;
  const strip = (s: string | undefined) =>
    s === undefined
      ? value
      : doStripSort
        ? StringWithSort.stripSortIndex(s)
        : s;

  if (abbrev && l.emdrostype[`${featureType}_abbrev`] !== undefined) {
    return strip(l.emdrostype[`${featureType}_abbrev`][value]);
  }

  // "list of ..." (solo se usa con verb classes en hebreo)
  if (featureType.substring(0, 8) === "list of ") {
    featureType = featureType.substring(8);
    value = value.substring(1, value.length - 2); // Quita paréntesis
    if (value.length === 0) return strip(l.emdrostype[featureType]?.["NA"]);

    const verbClasses = value.split(",");
    const localized: string[] = [];
    for (const vc of verbClasses)
      localized.push(
        doStripSort
          ? StringWithSort.stripSortIndex(l.emdrostype[featureType]?.[vc] ?? vc)
          : (l.emdrostype[featureType]?.[vc] ?? vc),
      );
    localized.sort();
    return localized.join(", ");
  }

  return strip(l.emdrostype[featureType]?.[value]);
}

export function getFeatureValueOtherFormat(otype: string, featureName: string, value: number): string {
  const table = l10n?.emdrosobject[otype]?.[`${featureName}_VALUES`] as typeValues[] | undefined;
  if (!table) return "?";
  for (const tv of table) if (tv.first <= value && tv.last >= value) return tv.text;
  return "?";
}

/** Reemplaza espacios por underscores (para atributos HTML). */
export function getHtmlAttribFriendlyName(str: string): string {
  return str.split(" ").join("_");
}
