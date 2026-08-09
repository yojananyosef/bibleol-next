/**
 * sheaf.ts — Réplica 1:1 de `helpers/sheaf_helper.php` de BibleOL
 * (clases OlTable, OlMatchedObject, OlStraw, OlSheaf, TableOrSheaf) y de
 * `OlMatchedObject`/`OlTable` tal como las construye Mql_native.
 */

import { OlMonadSet } from "./monads.ts";

/** `htmlspecialchars` de PHP (flags por defecto: ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML401). */
export function htmlSpecialChars(s: string | number | null | undefined): string {
  const str = String(s ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Inverso de htmlSpecialChars (htmlspecialchars_decode, ENT_QUOTES). */
export function htmlSpecialCharsDecode(s: string): string {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Tabla de celdas devuelta por comandos SELECT MIN_M/MAX_M, SELECT FEATURES… */
export class OlTable {
  private header: string[] | null = null;
  private cells: string[][] = [];

  set_header(h: string[]): void {
    this.header = h;
  }

  add_row(r: string[]): void {
    this.cells.push(r);
  }

  rows(): number {
    return this.cells.length;
  }

  cols(): number {
    return this.header?.length ?? 0;
  }

  get_header(col: number): string {
    return this.header![col];
  }

  get_cell(row: number, col: number): string {
    return this.cells[row][col];
  }

  get_rows(): string[][] {
    return this.cells;
  }
}

/** Objeto individual cosechado de una consulta MQL. */
export class OlMatchedObject {
  id_d: number;
  name: string;
  monadset: OlMonadSet | null = null;
  features: Record<string, string> | null = null;
  sheaf: OlSheaf | null = null;

  constructor(id_d: number, name: string) {
    this.id_d = id_d;
    this.name = name;
  }

  clear_sheaf_if_empty(): void {
    if (this.sheaf && this.sheaf.isEmpty()) this.sheaf = null;
  }

  set_sheaf(shf: OlSheaf | null): void {
    this.sheaf = shf;
  }

  get_sheaf(): OlSheaf | null {
    return this.sheaf;
  }

  set_monadset(ms: OlMonadSet): void {
    this.monadset = ms;
  }

  get_monadset(): OlMonadSet {
    return this.monadset!;
  }

  set_features(f: Record<string, string> | null): void {
    if (f === null) {
      this.features = null;
    } else {
      this.features = {};
      for (const [name, val] of Object.entries(f)) this.features[name] = htmlSpecialChars(val);
    }
  }

  get_features(): Record<string, string> | null {
    return this.features;
  }

  set_feature(name: string, value: string): void {
    if (this.features === null) this.features = {};
    this.features[name] = htmlSpecialChars(value);
  }

  /** Asigna una feature ya codificada (sin volver a escapar). */
  set_feature_raw(name: string, value: string): void {
    if (this.features === null) this.features = {};
    this.features[name] = value;
  }

  get_feature(name: string): string | undefined {
    return this.features?.[name];
  }

  get_id_d(): number {
    return this.id_d;
  }
}

/** Un conjunto de objetos que comparten los mismos monads. */
export class OlStraw {
  private matched_objects: OlMatchedObject[] = [];

  number_of_matched_objects(): number {
    return this.matched_objects.length;
  }

  add_matched_object(mo: OlMatchedObject): void {
    this.matched_objects.push(mo);
  }

  get_matched_objects(): OlMatchedObject[] {
    return this.matched_objects;
  }

  get_first_matched_object(): OlMatchedObject {
    return this.matched_objects[0];
  }
}

/** Haz de paja — resultado de una consulta. */
export class OlSheaf {
  private straws: OlStraw[] = [];
  private monadset: OlMonadSet[] | null = null;

  add_straw(str: OlStraw): void {
    this.straws.push(str);
  }

  get_straws(): OlStraw[] {
    return this.straws;
  }

  get_first_straw(): OlStraw {
    return this.straws[0];
  }

  number_of_straws(): number {
    return this.straws.length;
  }

  add_monadset(ms: OlMonadSet): void {
    if (this.monadset === null) this.monadset = [];
    this.monadset.push(ms);
  }

  get_monadset(): OlMonadSet[] | null {
    return this.monadset;
  }

  has_monadset(): boolean {
    return this.monadset !== null;
  }

  isEmpty(): boolean {
    return this.straws.length === 0 && this.monadset === null;
  }
}

/** Una tabla o un haz, resultado de un único comando MQL. */
export class TableOrSheaf {
  private table: OlTable | null = null;
  private sheaf: OlSheaf | null = null;

  set_table(t: OlTable): void {
    this.table = t;
  }

  get_table(): OlTable | null {
    return this.table;
  }

  set_sheaf(s: OlSheaf): void {
    this.sheaf = s;
  }

  get_sheaf(): OlSheaf | null {
    return this.sheaf;
  }
}
