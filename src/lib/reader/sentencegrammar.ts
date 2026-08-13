/**
 * reader/sentencegrammar.ts — Port client-side de `BibleOL/ts/sentencegrammar.ts`.
 *
 * Recorre la parte "sentencegrammar" del dbinfo para producir, para cada
 * objeto (palabra, frase, cláusula…), el nombre localizado de sus features
 * (walkFeatureNames) y el valor localizado de cada feature (walkFeatureValues).
 *
 * A diferencia del legacy (que añade métodos a los objetos del JSON con
 * addMethodsSgi + eval), aquí los items del JSON se "mejoran" a instancias
 * tipadas con `enhanceSentenceGrammar()`. La l10n se pasa por parámetro a los
 * walkers en vez de usar una variable global.
 */

// El WHAT enum identifica las distintas etapas al recorrer un objeto de configuración.
// (const object en vez de enum: node --experimental-strip-types no soporta enums)
export const WHAT = {
  feature: 0,
  metafeature: 1,
  groupstart: 2,
  groupend: 3,
} as const;

export type WHAT = (typeof WHAT)[keyof typeof WHAT];

/** Datos de localización que usan los walkers (la l10n_json del corpus). */
export interface ReaderL10n {
  emdrosobject: Record<string, Record<string, string | undefined>>;
  emdrostype?: Record<string, Record<string, string> | undefined>;
  grammargroup?: Record<string, Record<string, string>>;
  grammarfeature?: Record<string, Record<string, string>>;
  grammarmetafeature?: Record<string, Record<string, string>>;
  grammarsubfeature?: Record<string, Record<string, Record<string, string>>>;
}

export interface GrammarSubItem {
  mytype: string;
  name?: string;
  items?: GrammarSubItem[];
}

export interface ReaderSentenceGrammar {
  mytype: string;
  objType: string;
  items?: GrammarSubItem[];
}

/** FeatureSetting del dbinfo (lo que usa la UI de texto). */
export interface ReaderFeatureSetting {
  foreignText?: boolean;
  transliteratedText?: boolean;
  isGloss?: boolean;
  isDefault?: boolean;
  ignoreSelect?: boolean;
  ignoreShow?: boolean;
  hideWord?: boolean;
  hideValues?: string[];
  fontsize?: string;
  multiple?: boolean;
  isRange?: boolean;
  sqlargs?: string[];
  indirdb?: string;
}

/** objectSettings del dbinfo tipado para la UI. */
export type ReaderObjectSettings = Record<
  string,
  { featuresetting?: Record<string, ReaderFeatureSetting> }
>;

export type WalkFeatureNamesCb = (
  whattype: WHAT,
  objType: string,
  origObjType: string,
  featName: string,
  featNameLoc: string | null,
  sgiObj: SentenceGrammarItem,
) => void;

export type WalkFeatureValuesCb = (
  whattype: WHAT,
  objType: string,
  origObjType: string,
  featName: string,
  featValLoc: string,
  sgiObj: SentenceGrammarItem,
) => void;

/** Valores de features planos de un MonadObject (features del JSON del Dictionary). */
export type FeatureMap = Record<string, string>;

/** Typeinfo del corpus (solo lo que usa el walker de valores). */
export interface ReaderTypeInfo {
  obj2feat: Record<string, Record<string, string>>;
}

export interface SentenceGrammarItem {
  mytype: string;
  name?: string;
  items?: SentenceGrammarItem[];
  containsFeature(f: string): boolean;
  walkFeatureNames(objType: string, l10n: ReaderL10n, callback: WalkFeatureNamesCb): void;
  walkFeatureValues(
    features: FeatureMap,
    mix: number,
    objType: string,
    abbrev: boolean,
    l10n: ReaderL10n,
    typeinfo: ReaderTypeInfo,
    callback: WalkFeatureValuesCb,
  ): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Localización de valores (localization.ts + stringwithsort.ts del legacy)
// ─────────────────────────────────────────────────────────────────────────────

/** stripSortIndex (stringwithsort.ts): elimina el índice de orden '#'-prefijo. */
export function stripSortIndex(s: string): string {
  return s.length > 0 && s.charAt(0) === "#" ? s.substring(s.indexOf(" ") + 1) : s;
}

/** getFeatureValueFriendlyName (localization.ts). */
export function getFeatureValueFriendlyName(
  l10n: ReaderL10n,
  featureType: string,
  value: string,
  abbrev: boolean,
  doStripSort: boolean,
): string {
  if (abbrev && l10n.emdrostype?.[`${featureType}_abbrev`] !== undefined)
    return doStripSort
      ? stripSortIndex(l10n.emdrostype[`${featureType}_abbrev`]?.[value] ?? value)
      : (l10n.emdrostype[`${featureType}_abbrev`]?.[value] ?? value);

  // "list of ..." (solo se usa con clases verbales hebreas)
  if (featureType.substring(0, 8) === "list of ") {
    featureType = featureType.substring(8);
    value = value.substring(1, value.length - 2);
    if (value.length === 0)
      return doStripSort
        ? stripSortIndex(l10n.emdrostype?.[featureType]?.["NA"] ?? "NA")
        : (l10n.emdrostype?.[featureType]?.["NA"] ?? "NA");

    const verbClasses = value.split(",");
    const localized: string[] = [];
    for (const vc of verbClasses)
      localized.push(
        doStripSort
          ? stripSortIndex(l10n.emdrostype?.[featureType]?.[vc] ?? vc)
          : (l10n.emdrostype?.[featureType]?.[vc] ?? vc),
      );
    localized.sort();
    return localized.join(", ");
  }

  return doStripSort
    ? stripSortIndex(l10n.emdrostype?.[featureType]?.[value] ?? value)
    : (l10n.emdrostype?.[featureType]?.[value] ?? value);
}

/** getFeatureValueOtherFormat (localization.ts): rangos _VALUES.
 *  El JSON puede venir como array (files .prop.pretty.json) o como objeto
 *  con claves numéricas (filas de db_localize) — como el foreach de PHP. */
export function getFeatureValueOtherFormat(
  l10n: ReaderL10n,
  otype: string,
  featureName: string,
  value: number,
): string {
  const table = l10n.emdrosobject[otype]?.[`${featureName}_VALUES`] as
    | Record<string, { first: number; last: number; text: string }>
    | { first: number; last: number; text: string }[]
    | undefined;
  if (table === undefined) return "?";
  for (const t of Object.values(table)) if (t.first <= value && t.last >= value) return t.text;
  return "?";
}

// ─────────────────────────────────────────────────────────────────────────────
// GrammarGroup — agrupa features (p.ej. "lexeme") bajo un nombre localizado.
// ─────────────────────────────────────────────────────────────────────────────

export class GrammarGroup implements SentenceGrammarItem {
  mytype = "GrammarGroup";
  name?: string;
  items: SentenceGrammarItem[];

  constructor(name: string | undefined, items: SentenceGrammarItem[]) {
    this.name = name;
    this.items = items;
  }

  containsFeature(f: string): boolean {
    for (const item of this.items) if (item.containsFeature(f)) return true;
    return false;
  }

  walkFeatureNames(objType: string, l10n: ReaderL10n, callback: WalkFeatureNamesCb): void {
    callback(WHAT.groupstart, objType, objType, this.name ?? "", this.name ? l10n.grammargroup?.[objType]?.[this.name] ?? this.name : null, this);
    for (const item of this.items) item.walkFeatureNames(objType, l10n, callback);
    callback(WHAT.groupend, objType, objType, this.name ?? "", null, this);
  }

  walkFeatureValues(features: FeatureMap, mix: number, objType: string, abbrev: boolean, l10n: ReaderL10n, typeinfo: ReaderTypeInfo, callback: WalkFeatureValuesCb): void {
    callback(WHAT.groupstart, objType, objType, this.name ?? "", "", this);
    for (const item of this.items) item.walkFeatureValues(features, mix, objType, abbrev, l10n, typeinfo, callback);
    callback(WHAT.groupend, objType, objType, this.name ?? "", "", this);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GrammarSubFeature — una feature que forma parte de una GrammarMetaFeature.
// ─────────────────────────────────────────────────────────────────────────────

export class GrammarSubFeature implements SentenceGrammarItem {
  mytype = "GrammarSubFeature";
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  containsFeature(f: string): boolean {
    return this.name === f;
  }

  walkFeatureNames(objType: string, l10n: ReaderL10n, callback: WalkFeatureNamesCb): void {
    // Los subfeatures no producen filas propias: solo se muestran combinados
    // en la GrammarMetaFeature.
    void objType;
    void l10n;
    void callback;
  }

  walkFeatureValues(features: FeatureMap, mix: number, objType: string, abbrev: boolean, l10n: ReaderL10n, typeinfo: ReaderTypeInfo, callback: WalkFeatureValuesCb): void {
    void mix;
    void abbrev;
    void typeinfo;
    void callback;
  }

  /** Valor localizado del subfeature (parte de una metafeature). */
  getFeatValPart(features: FeatureMap, objType: string, l10n: ReaderL10n): string {
    const table = l10n.grammarsubfeature?.[objType]?.[this.name];
    const v = features[this.name] ?? "";
    return table?.[v] ?? v;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GrammarMetaFeature — combina varios subfeatures (p.ej. pgn = persona+género+número)
// ─────────────────────────────────────────────────────────────────────────────

export class GrammarMetaFeature implements SentenceGrammarItem {
  mytype = "GrammarMetaFeature";
  name: string;
  items: GrammarSubFeature[];

  constructor(name: string, items: GrammarSubFeature[]) {
    this.name = name;
    this.items = items;
  }

  containsFeature(f: string): boolean {
    for (const item of this.items) if (item.containsFeature(f)) return true;
    return false;
  }

  walkFeatureNames(objType: string, l10n: ReaderL10n, callback: WalkFeatureNamesCb): void {
    const loc = l10n.grammarmetafeature?.[objType]?.[this.name];
    callback(WHAT.metafeature, objType, objType, this.name, loc ?? this.name, this);
  }

  walkFeatureValues(features: FeatureMap, mix: number, objType: string, abbrev: boolean, l10n: ReaderL10n, typeinfo: ReaderTypeInfo, callback: WalkFeatureValuesCb): void {
    void mix;
    void abbrev;
    void typeinfo;
    let res = "";
    for (const item of this.items) res += item.getFeatValPart(features, objType, l10n);
    callback(WHAT.metafeature, objType, objType, this.name, res, this);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GrammarFeature — una feature Emdros de un objeto (o de un subobjeto "tipo:feat")
// ─────────────────────────────────────────────────────────────────────────────

export class GrammarFeature implements SentenceGrammarItem {
  mytype = "GrammarFeature";
  name: string;

  /** Feature de subobjeto (p.ej. "clause_atom:tab") o no. */
  isSubObj: boolean;
  realObjectType: string;
  realFeatureName: string;

  constructor(name: string, objType: string) {
    this.name = name;

    const io = name.indexOf(":");
    if (io !== -1) {
      this.isSubObj = true;
      this.realObjectType = name.substring(0, io);
      this.realFeatureName = name.substring(io + 1);
    } else {
      this.isSubObj = false;
      this.realObjectType = objType;
      this.realFeatureName = name;
    }
  }

  containsFeature(f: string): boolean {
    return this.name === f;
  }

  walkFeatureNames(objType: string, l10n: ReaderL10n, callback: WalkFeatureNamesCb): void {
    // Normalmente el nombre localizado está en l10n.emdrosobject, pero a veces
    // hay traducciones especiales en l10n.grammarfeature.
    const special = l10n.grammarfeature?.[this.realObjectType]?.[this.realFeatureName];
    const loc = special ?? l10n.emdrosobject[this.realObjectType]?.[this.realFeatureName];
    callback(WHAT.feature, this.realObjectType, objType, this.realFeatureName, loc ?? null, this);
  }

  walkFeatureValues(
    features: FeatureMap,
    mix: number,
    objType: string,
    abbrev: boolean,
    l10n: ReaderL10n,
    typeinfo: ReaderTypeInfo,
    callback: WalkFeatureValuesCb,
  ): void {
    void mix;
    const realName = this.realFeatureName;

    // Normalmente featType contiene el tipo de la feature. Sin embargo, el
    // nombre puede contener la cadena _TYPE_, en cuyo caso se usa un formato
    // alternativo (getFeatureValueOtherFormat).
    const io = realName.indexOf("_TYPE_");
    const realRealFeatureName = io === -1 ? realName : realName.substring(0, io);

    const featType = typeinfo.obj2feat[this.realObjectType]?.[this.realFeatureName] ?? "";

    let res: string = this.isSubObj
      ? features[realRealFeatureName] ?? ""
      : features[realRealFeatureName] ?? "";

    switch (featType) {
      case "string":
      case "ascii":
        if (res === "") res = "-";
        break;

      case "url": {
        if (res.length === 0) res = "-";
        else {
          // El legacy asume un array [{url, icon}]; aquí el valor llega
          // serializado (JSON string) o como texto plano.
          try {
            const arr = JSON.parse(res) as { url?: string; icon?: string }[];
            if (Array.isArray(arr)) {
              let res2 = "";
              for (const item of arr) {
                if (!item.url) continue;
                res2 += `<a style="padding-right:1px;padding-left:1px;" href="${item.url}" target="_blank">${item.url}</a>`;
              }
              res = res2 === "" ? "-" : res2;
            }
          } catch {
            // Texto plano: se muestra tal cual
          }
        }
        break;
      }

      case "integer":
        break;

      default:
        if (io === -1) {
          if (res !== "") res = getFeatureValueFriendlyName(l10n, featType, res, abbrev, true);
        } else {
          res = getFeatureValueOtherFormat(l10n, this.realObjectType, this.realFeatureName, +res);
        }
        break;
    }

    callback(WHAT.feature, this.realObjectType, objType, this.realFeatureName, res, this);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SentenceGrammar — el objeto raíz para un tipo de objeto Emdros
// ─────────────────────────────────────────────────────────────────────────────

export class SentenceGrammar implements SentenceGrammarItem {
  mytype = "SentenceGrammar";
  objType: string;
  items: SentenceGrammarItem[];

  constructor(objType: string, items: SentenceGrammarItem[]) {
    this.objType = objType;
    this.items = items;
  }

  containsFeature(f: string): boolean {
    for (const item of this.items) if (item.containsFeature(f)) return true;
    return false;
  }

  walkFeatureNames(objType: string, l10n: ReaderL10n, callback: WalkFeatureNamesCb): void {
    for (const item of this.items) item.walkFeatureNames(objType, l10n, callback);
  }

  walkFeatureValues(features: FeatureMap, mix: number, objType: string, abbrev: boolean, l10n: ReaderL10n, typeinfo: ReaderTypeInfo, callback: WalkFeatureValuesCb): void {
    for (const item of this.items) item.walkFeatureValues(features, mix, objType, abbrev, l10n, typeinfo, callback);
  }
}

/** Convierte un item del JSON del dbinfo en un objeto tipado. */
export function enhanceItem(item: GrammarSubItem, objType: string): SentenceGrammarItem {
  switch (item.mytype) {
    case "GrammarGroup":
    case "GrammarGroupGlosses":
      return new GrammarGroup(item.name, (item.items ?? []).map((it) => enhanceItem(it, objType)));
    case "GrammarFeature":
      return new GrammarFeature(item.name ?? "", objType);
    case "GrammarMetaFeature":
      return new GrammarMetaFeature(
        item.name ?? "",
        (item.items ?? []).map((it) => new GrammarSubFeature(it.name ?? "")),
      );
    case "GrammarSubFeature":
      return new GrammarSubFeature(item.name ?? "");
    default:
      return new GrammarGroup(item.name, (item.items ?? []).map((it) => enhanceItem(it, objType)));
  }
}

/**
 * Mejora el "sentencegrammar" del dbinfo a objetos tipados (equivalente a
 * addMethodsSgi). Devuelve la lista de SentenceGrammar por nivel.
 */
export function enhanceSentenceGrammar(sentencegrammar: ReaderSentenceGrammar[]): SentenceGrammar[] {
  return sentencegrammar.map(
    (sg) => new SentenceGrammar(sg.objType, (sg.items ?? []).map((it) => enhanceItem(it, sg.objType))),
  );
}

/** Recupera la SentenceGrammar que describe un tipo de objeto Emdros. */
export function getSentenceGrammarFor(sentencegrammar: SentenceGrammar[], oType: string): SentenceGrammar | null {
  for (const sg of sentencegrammar) if (sg.objType === oType) return sg;
  return null;
}
