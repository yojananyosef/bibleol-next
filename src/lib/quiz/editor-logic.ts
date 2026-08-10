/**
 * quiz/editor-logic.ts — Lógica pura del editor de ejercicios.
 *
 * Port 1:1 de la parte sin DOM de `BibleOL/ts/paneltemplmql.ts` (los seis
 * FeatureHandlers y ListValuesHandler), de los tipos de `paneltemplquizfeatures.ts`
 * (ButtonSelection, QuizFeatures) y del modelo de orden de las features
 * ("order dropdowns"). La UI de React de src/components/quiz/editor/ usa estas
 * clases como modelo mutable.
 */

import { StringWithSort } from "../../legacy-ts/stringwithsort.ts";
import { localize, getFeatureValueFriendlyName } from "../../legacy-ts/localization.ts";
import type {
  FeatureHandler as WireFeatureHandler,
  MqlData as WireMqlData,
  QuizFeaturesData,
  RequestFeature,
  DontShowObject,
} from "./template-parser";

// ---------------------------------------------------------------------------
// FeatureHandlers (paneltemplmql.ts, sin DOM)
// ---------------------------------------------------------------------------

/** Superclase de los handlers de búsqueda de features del editor. */
export abstract class EditorFeatureHandler {
  /** Comparador ('equals' | 'differs' | 'matches' según el tipo). */
  comparator: string;
  /** El tipo de la feature ('stringfeature', 'integerfeature', ...). */
  type: string;
  /** El nombre de la feature. */
  name: string;

  /**
   * Construye el handler. (Los parámetros son públicos como en el legacy;
   * no se usan "parameter properties" para que Node los pueda ejecutar
   * directamente en modo strip-only, sin transpilar.)
   */
  constructor(type: string, name: string) {
    this.type = type;
    this.name = name;
    this.comparator = "equals";
  }

  /** No hace nada en la base (subclases: aseguran la longitud de los arrays). */
  normalize(): void {}

  /** Cambia el comparador. */
  setComparator(value: "equals" | "differs" | "matches"): void {
    this.comparator = value;
  }

  abstract hasValues(): boolean;

  abstract toMql(): string;

  /** Operador MQL del comparador. */
  protected getComparator(): string {
    switch (this.comparator) {
      case "equals":
        return "=";
      case "differs":
        return "<>";
      case "matches":
        return "~";
    }
    return "";
  }

  /** Operador lógico al combinar varias comparaciones del mismo feature. */
  getJoiner(): string {
    switch (this.comparator) {
      case "equals":
        return " OR ";
      case "differs":
        return " AND ";
      case "matches":
        return " OR ";
    }
    return "";
  }
}

/** Busca features de tipo string. */
export class EditorStringFeatureHandler extends EditorFeatureHandler {
  values: (string | null)[];
  private static readonly TYPE = "stringfeature";

  constructor(name: string) {
    super(EditorStringFeatureHandler.TYPE, name);
    this.values = [];
    this.normalize();
  }

  normalize(): void {
    if (this.values.length < 1) this.values.push(null);
  }

  setValue(index: number, val: string): void {
    this.values[index] = val;
  }

  removeValue(index: number): void {
    this.values[index] = null;
  }

  hasValues(): boolean {
    for (const v of this.values) if (v !== null) return true;
    return false;
  }

  toMql(): string {
    const comparator = this.getComparator();
    const values: string[] = [];
    for (const v of this.values) if (v !== null) values.push(`${this.name}${comparator}"${v}"`);
    if (values.length === 1) return values[0];
    return `(${values.join(this.getJoiner())})`;
  }
}

/** Busca features con valores enteros concretos. */
export class EditorIntegerFeatureHandler extends EditorFeatureHandler {
  values: (number | null)[];
  private static readonly TYPE = "integerfeature";

  constructor(name: string) {
    super(EditorIntegerFeatureHandler.TYPE, name);
    this.values = [];
    this.normalize();
  }

  normalize(): void {
    while (this.values.length < 4) this.values.push(null);
  }

  setValue(index: number, val: number): void {
    this.values[index] = val;
  }

  removeValue(index: number): void {
    this.values[index] = null;
  }

  hasValues(): boolean {
    for (const v of this.values) if (v !== null) return true;
    return false;
  }

  toMql(): string {
    const values: number[] = [];
    for (const v of this.values) if (v !== null) values.push(v);
    if (values.length === 1) return `${this.name}${this.getComparator()}${values[0]}`;
    return (this.comparator === "differs" ? "NOT " : "") + `${this.name} IN (${values.join(",")})`;
  }
}

/** Busca features con valores enteros dentro de un rango. */
export class EditorRangeIntegerFeatureHandler extends EditorFeatureHandler {
  value_low: number | null;
  value_high: number | null;
  private static readonly TYPE = "rangeintegerfeature";

  constructor(name: string) {
    super(EditorRangeIntegerFeatureHandler.TYPE, name);
    this.value_low = null;
    this.value_high = null;
  }

  set_low_high(index: string, val: number | null): void {
    switch (index) {
      case "value_low":
        this.value_low = val;
        break;
      case "value_high":
        this.value_high = val;
        break;
      default:
        throw "Illegal index in access_low_high";
    }
  }

  isSetLow(): boolean {
    return this.value_low !== null && this.value_low !== undefined;
  }

  isSetHigh(): boolean {
    return this.value_high !== null && this.value_high !== undefined;
  }

  hasValues(): boolean {
    return this.isSetLow() || this.isSetHigh();
  }

  toMql(): string {
    if (this.isSetLow()) {
      if (this.isSetHigh()) return `(${this.name}>=${this.value_low} AND ${this.name}<=${this.value_high})`;
      return `${this.name}>=${this.value_low}`;
    }
    if (this.isSetHigh()) return `${this.name}<=${this.value_high}`;
    return "";
  }
}

/** Busca features de tipo enumeración. */
export class EditorEnumFeatureHandler extends EditorFeatureHandler {
  values: string[];
  private static readonly TYPE = "enumfeature";

  constructor(name: string) {
    super(EditorEnumFeatureHandler.TYPE, name);
    this.values = [];
  }

  addValue(val: string): void {
    this.values.push(val);
  }

  removeValue(val: string): void {
    const index = this.values.indexOf(val);
    if (index > -1) this.values.splice(index, 1);
  }

  hasValues(): boolean {
    return this.values.length > 0;
  }

  toMql(): string {
    return (this.comparator === "differs" ? "NOT " : "") + `${this.name} IN (${this.values.join(",")})`;
  }
}

/** Lista de valores de enumeración que deben (o no) estar presentes. */
export class EditorListValuesHandler {
  type = "listvalues";
  yes_values: string[];
  no_values: string[];

  constructor() {
    this.yes_values = [];
    this.no_values = [];
  }

  modifyValue(name: string, val: string): void {
    const yes_index = this.yes_values.indexOf(name);
    const no_index = this.no_values.indexOf(name);

    switch (val) {
      case "yes":
        if (yes_index === -1) this.yes_values.push(name);
        if (no_index > -1) this.no_values.splice(no_index, 1);
        break;

      case "no":
        if (no_index === -1) this.no_values.push(name);
        if (yes_index > -1) this.yes_values.splice(yes_index, 1);
        break;

      case "dontcare":
        if (no_index > -1) this.no_values.splice(no_index, 1);
        if (yes_index > -1) this.yes_values.splice(yes_index, 1);
        break;
    }
  }

  hasValues(): boolean {
    return this.yes_values.length + this.no_values.length > 0;
  }

  toMql(featName: string): string {
    const stringValues: string[] = [];
    for (const v of this.yes_values) stringValues.push(`${featName} HAS ${v}`);
    for (const v of this.no_values) stringValues.push(`NOT ${featName} HAS ${v}`);
    if (stringValues.length === 1) return stringValues[0];
    return `(${stringValues.join(" AND ")})`;
  }
}

/** Busca features tipo "lista de ..." (hoy, verb classes del hebreo). */
export class EditorEnumListFeatureHandler extends EditorFeatureHandler {
  listvalues: EditorListValuesHandler[];
  private static readonly TYPE = "enumlistfeature";

  constructor(name: string) {
    super(EditorEnumListFeatureHandler.TYPE, name);
    this.listvalues = [];
    this.normalize();
  }

  normalize(): void {
    while (this.listvalues.length < 4) this.listvalues.push(new EditorListValuesHandler());
  }

  hasValues(): boolean {
    for (const lv of this.listvalues) if (lv.hasValues()) return true;
    return false;
  }

  toMql(): string {
    if (this.listvalues.length > 0) {
      let sb = "(";
      let first = true;
      for (const lvh of this.listvalues) {
        if (lvh.hasValues()) {
          if (first) first = false;
          else sb += " OR ";
          sb += lvh.toMql(this.name);
        }
      }
      return sb + ")";
    }
    return "";
  }
}

/** Omite formas qere. */
export class EditorQereFeatureHandler extends EditorFeatureHandler {
  omit: boolean;
  private static readonly TYPE = "qerefeature";

  constructor(name: string) {
    super(EditorQereFeatureHandler.TYPE, name);
    this.omit = false;
  }

  setValue(val: boolean): void {
    this.omit = val;
  }

  hasValues(): boolean {
    return this.omit;
  }

  toMql(): string {
    if (this.omit) return `(${this.name}='' AND g_word_translit<>'HÎʔ')`;
    return "";
  }
}

/** Construye el handler de editor para un handler serializado (del .3et). */
export function editorHandlerOf(w: WireFeatureHandler): EditorFeatureHandler {
  switch (w.type) {
    case "stringfeature": {
      const h = new EditorStringFeatureHandler(w.name);
      h.comparator = w.comparator;
      h.values = [...w.values];
      return h;
    }
    case "integerfeature": {
      const h = new EditorIntegerFeatureHandler(w.name);
      h.comparator = w.comparator;
      h.values = [...w.values];
      return h;
    }
    case "rangeintegerfeature": {
      const h = new EditorRangeIntegerFeatureHandler(w.name);
      h.comparator = w.comparator;
      h.value_low = w.isSet_low ? (w.value_low ?? null) : null;
      h.value_high = w.isSet_high ? (w.value_high ?? null) : null;
      return h;
    }
    case "enumfeature": {
      const h = new EditorEnumFeatureHandler(w.name);
      h.comparator = w.comparator;
      h.values = [...w.values];
      return h;
    }
    case "enumlistfeature": {
      const h = new EditorEnumListFeatureHandler(w.name);
      for (let i = 0; i < w.listvalues.length && i < h.listvalues.length; ++i) {
        h.listvalues[i].yes_values = [...w.listvalues[i].yes_values];
        h.listvalues[i].no_values = [...w.listvalues[i].no_values];
      }
      return h;
    }
    case "qerefeature": {
      const h = new EditorQereFeatureHandler(w.name);
      h.omit = w.omit;
      return h;
    }
  }
}

/** Serializa un handler del editor al formato de plantilla (.3et). */
export function wireHandlerOf(h: EditorFeatureHandler): WireFeatureHandler {
  switch (h.type) {
    case "stringfeature": {
      const v = h as EditorStringFeatureHandler;
      return { type: "stringfeature", name: v.name, comparator: v.comparator, values: (v.values ?? []).filter((x): x is string => x !== null && x !== undefined) };
    }
    case "integerfeature": {
      const v = h as EditorIntegerFeatureHandler;
      return { type: "integerfeature", name: v.name, comparator: v.comparator, values: (v.values ?? []).filter((x): x is number => x !== null && x !== undefined) };
    }
    case "rangeintegerfeature": {
      const v = h as EditorRangeIntegerFeatureHandler;
      // Datos planos (JSON) o clases: sin llamadas a métodos.
      const isSet_low = v.value_low !== null && v.value_low !== undefined;
      const isSet_high = v.value_high !== null && v.value_high !== undefined;
      return {
        type: "rangeintegerfeature",
        name: v.name,
        comparator: v.comparator,
        value_low: isSet_low ? v.value_low ?? undefined : undefined,
        value_high: isSet_high ? v.value_high ?? undefined : undefined,
        isSet_low,
        isSet_high,
      };
    }
    case "enumfeature": {
      const v = h as EditorEnumFeatureHandler;
      return { type: "enumfeature", name: v.name, comparator: v.comparator, values: [...(v.values ?? [])] };
    }
    case "enumlistfeature": {
      const v = h as EditorEnumListFeatureHandler;
      return {
        type: "enumlistfeature",
        name: v.name,
        listvalues: (v.listvalues ?? []).map((lv) => ({ yes_values: [...(lv.yes_values ?? [])], no_values: [...(lv.no_values ?? [])] })),
      };
    }
    case "qerefeature": {
      const v = h as EditorQereFeatureHandler;
      return { type: "qerefeature", name: v.name, omit: v.omit };
    }
    default:
      throw new Error(`Unknown feature handler type: ${h.type}`);
  }
}

/** ¿Tiene valores? Sobre datos planos (JSON), sin métodos de clase. */
export function wireHandlerHasValues(h: EditorFeatureHandler): boolean {
  switch (h.type) {
    case "stringfeature": {
      const v = h as EditorStringFeatureHandler;
      return (v.values ?? []).some((x) => x !== null && x !== undefined);
    }
    case "integerfeature": {
      const v = h as EditorIntegerFeatureHandler;
      return (v.values ?? []).some((x) => x !== null && x !== undefined);
    }
    case "rangeintegerfeature": {
      const v = h as EditorRangeIntegerFeatureHandler;
      return (v.value_low !== null && v.value_low !== undefined) || (v.value_high !== null && v.value_high !== undefined);
    }
    case "enumfeature": {
      const v = h as EditorEnumFeatureHandler;
      return (v.values ?? []).length > 0;
    }
    case "enumlistfeature": {
      const v = h as EditorEnumListFeatureHandler;
      return (v.listvalues ?? []).some((lv) => (lv.yes_values ?? []).length + (lv.no_values ?? []).length > 0);
    }
    case "qerefeature": {
      const v = h as EditorQereFeatureHandler;
      return v.omit === true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// MqlData del editor (forma legacy con featHand.vhand)
// ---------------------------------------------------------------------------

/** Selección de frases/unidades de frase del editor (1:1 con el JSON legacy). */
export interface EditorMqlData {
  object: string;
  mql: string | null;
  featHand: { vhand: EditorFeatureHandler[] } | null;
  useForQo: boolean;
}

/** Convierte el MqlData de plantilla (template-parser) a la forma del editor. */
export function editorMqlDataOf(w: WireMqlData): EditorMqlData {
  return {
    object: w.object,
    mql: w.mql,
    featHand: w.featHand.length > 0 || w.mql === null ? { vhand: w.featHand.map(editorHandlerOf) } : null,
    useForQo: w.useForQo ?? false,
  };
}

/** Convierte el MqlData del editor a la forma de plantilla (para guardar). */
export function wireMqlDataOf(md: EditorMqlData): WireMqlData {
  return {
    object: md.object,
    mql: md.mql,
    featHand: md.mql === null && md.featHand ? md.featHand.vhand.filter(wireHandlerHasValues).map(wireHandlerOf) : [],
    useForQo: md.useForQo,
  };
}

// ---------------------------------------------------------------------------
// QuizFeatures del editor (paneltemplquizfeatures.ts, sin DOM)
// ---------------------------------------------------------------------------

/**
 * Selección de los botones de una feature. (Const object + tipo unión en
 * lugar de enum: Node ejecuta los .ts directamente en modo strip-only.)
 */
export const ButtonSelection = {
  SHOW: 0,
  REQUEST: 1,
  REQUEST_DROPDOWN: 2,
  DONT_CARE: 3,
  DONT_SHOW: 4,
} as const;
export type ButtonSelection = (typeof ButtonSelection)[keyof typeof ButtonSelection];

/** Features solicitadas (el order_val se añade al guardar). */
export interface EditorRequestFeature {
  name: string;
  usedropdown: boolean;
  hideFeatures: string[] | null;
  /** Rango (1..n) del dropdown de orden; el servidor ordena por este valor. */
  order_val?: string;
}

/** Especificación de features del editor (1:1 con el JSON legacy). */
export interface EditorQuizFeatures {
  showFeatures: string[];
  requestFeatures: EditorRequestFeature[];
  dontShowFeatures: string[];
  dontShowObjects: DontShowObject[];
  glosslimit: number;
}

/** Convierte QuizFeaturesData (template) a la forma del editor. */
export function editorQuizFeaturesOf(qf: QuizFeaturesData): EditorQuizFeatures {
  return {
    showFeatures: [...qf.showFeatures],
    requestFeatures: qf.requestFeatures.map((rf: RequestFeature) => ({
      name: rf.name,
      usedropdown: rf.usedropdown,
      hideFeatures: rf.hideFeatures,
      order_val: String(rf.order_val),
    })),
    dontShowFeatures: [...qf.dontShowFeatures],
    dontShowObjects: qf.dontShowObjects.map((d) => ({ content: d.content, ...(d.show !== undefined ? { show: d.show } : {}) })),
    glosslimit: qf.glosslimit,
  };
}

/**
 * Convierte EditorQuizFeatures a QuizFeaturesData ordenando por order_val
 * (1:1 con QuizFeatures::writeAsXml del legacy). Devuelve las request features
 * con order_val = posición 1..n ya ordenada.
 */
export function wireQuizFeaturesOf(qf: EditorQuizFeatures): QuizFeaturesData {
  const sorted = [...qf.requestFeatures]
    .map((rf, i) => ({ rf, order: rf.order_val !== undefined && /^\d+$/.test(rf.order_val) ? +rf.order_val : 100 + i }))
    .sort((a, b) => a.order - b.order)
    .map(({ rf }) => rf);
  return {
    showFeatures: [...qf.showFeatures],
    requestFeatures: sorted.map((rf, i) => ({
      name: rf.name,
      usedropdown: rf.usedropdown,
      hideFeatures: rf.hideFeatures,
      order_val: i + 1,
    })),
    dontShowFeatures: [...qf.dontShowFeatures],
    dontShowObjects: qf.dontShowObjects.map((d) => ({ content: d.content, ...(d.show !== undefined ? { show: d.show } : {}) })),
    glosslimit: qf.glosslimit,
  };
}

// ---------------------------------------------------------------------------
// Modelo de orden de las features ("order dropdowns")
// ---------------------------------------------------------------------------

/**
 * Mantiene el orden de las features solicitadas. 1:1 con las variables y
 * handlers globales de paneltemplquizfeatures.ts (feature_array, n,
 * initialize, initMenus, updateOrderDropdowns, unselectReqFeat).
 */
export class FeatureOrder {
  /** Feature names en orden de solicitud. */
  featureArray: string[] = [];
  /** Número de features solicitadas. */
  n = 0;
  /** Ya inicializado con los órdenes guardados en el fichero. */
  initialize = true;

  /** initMenus(): arranca con el orden guardado en el fichero. */
  initMenus(orderFeatures: string[], featName: string): void {
    if (orderFeatures.indexOf(featName) !== -1) {
      if (this.featureArray.length === orderFeatures.length) {
        this.initialize = false;
        this.featureArray = [...orderFeatures];
      }
    } else if (orderFeatures.length === 0) {
      this.initialize = false;
    }
  }

  /** El usuario marcó "request" en la feature. */
  addRequest(name: string): void {
    if (this.featureArray.indexOf(name) === -1) {
      this.n = this.n + 1;
      this.featureArray.push(name);
    }
  }

  /** El usuario desmarcó "request" en la feature. */
  unselectReqFeat(name: string): void {
    if (this.n > 0) this.n = this.n - 1;
    this.featureArray = this.featureArray.filter((item) => item !== name);
  }

  /** El usuario cambió el orden de `name` a la posición nueva_idx (0-based). */
  moveTo(name: string, newIdx: number): string[] {
    const currentIdx = this.featureArray.indexOf(name);
    if (currentIdx === -1 || newIdx < 0 || newIdx >= this.featureArray.length) return this.featureArray;
    const moved = this.featureArray[newIdx];
    this.featureArray[newIdx] = name;
    this.featureArray[currentIdx] = moved;
    return this.featureArray;
  }

  /** Rango de opciones del dropdown (1..n). */
  optionCount(): number {
    return this.initialize ? this.n : this.n;
  }

  /** Posición (1-based) de una feature en el orden actual ('' si no está). */
  rankOf(name: string): string {
    const rank = String(this.featureArray.indexOf(name) + 1);
    return rank === "0" ? "" : rank;
  }
}

// ---------------------------------------------------------------------------
// Utilidades de UI (verb class panels, grids)
// ---------------------------------------------------------------------------

/** Selección de una verb class (const object, ver ButtonSelection). */
export const VerbClassSelection = {
  YES: 0,
  NO: 1,
  DONT_CARE: 2,
} as const;
export type VerbClassSelection = (typeof VerbClassSelection)[keyof typeof VerbClassSelection];

/** Una fila del panel de verb classes (1:1 con VerbClassButtonsAndLabel). */
export interface VerbClassRow {
  label: string; // Nombre localizado
  name: string; // Emdros name
  sel: VerbClassSelection; // Selección inicial
}

/**
 * Filas de radio buttons para una "choice" de un feature tipo "list of ...".
 * Port de PanelForOneVcChoice (las enumeraciones se ordenan con StringWithSort).
 */
export function verbClassRows(enumValues: string[], valueType: string, lv: { yes_values: string[]; no_values: string[] }): VerbClassRow[] {
  const swsValues: StringWithSort[] = [];
  for (const ev of enumValues)
    swsValues.push(new StringWithSort(getFeatureValueFriendlyName(valueType, ev, false, false), ev));
  swsValues.sort((a, b) => StringWithSort.compare(a, b));

  const rows: VerbClassRow[] = [];
  for (const sws of swsValues) {
    const vc = sws.getInternal();
    let vcsel: VerbClassSelection = VerbClassSelection.DONT_CARE;
    if (lv.yes_values.indexOf(vc) !== -1) vcsel = VerbClassSelection.YES;
    else if (lv.no_values.indexOf(vc) !== -1) vcsel = VerbClassSelection.NO;
    rows.push({ label: sws.getString(), name: vc, sel: vcsel });
  }
  return rows;
}

/** Número de columnas para un grid de checkboxes (1, 2 o 3). */
export function columnsFor(count: number): number {
  return count > 12 ? 3 : count > 4 ? 2 : 1;
}

/** Conjuntos de verbal stems (1:1 con el LimitDialog del legacy). */
export const HEBREW_STEMS = ["NA", "etpa", "hif", "hit", "hof", "hotp", "hsht", "htpo", "nif", "nit", "pasq", "piel", "poal", "poel", "pual", "qal", "tif"];
export const ARAMAIC_STEMS = ["NA", "afel", "etpa", "etpe", "haf ", "hof ", "hsht", "htpa", "htpe", "pael", "peal", "peil", "shaf"];

/** Etiquetas de los tabs de verb class (1:1 con los tab_labels del legacy). */
export function verbClassTabLabels(): string[] {
  return [localize("1st_choice"), localize("2nd_choice"), localize("3rd_choice"), localize("4th_choice")];
}