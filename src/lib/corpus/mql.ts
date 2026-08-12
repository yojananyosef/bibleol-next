/**
 * mql.ts — Traductor MQL→SQL sobre bases SQLite Emdros.
 *
 * Subconjunto de MQL usado por BibleOL (Mod_askemdros/Dictionary/Quiz_data):
 *  - `SELECT ALL OBJECTS [IN <mset>] WHERE <blocks>` (subset: monads ⊆ set)
 *  - `GET OBJECTS HAVING MONADS IN <mset> <blocks>` (overlap)
 *  - `SELECT MIN_M` / `SELECT MAX_M` / `SELECT OBJECT TYPES`
 *  - `SELECT FEATURES FROM [<otype>]` / `SELECT ENUMERATIONS`
 *  - `SELECT ENUMERATION CONSTANTS FROM <enum>`
 *
 * Bloques: `[<otype> [RETRIEVE|NORETRIEVE] [GET f1,f2] <predicates> [inner...]]`
 * Predicados: comparaciones `= <> < <= > >= ~ !~`, `IN (...)`, booleanos
 * `AND OR NOT` y paréntesis. Bloques al mismo nivel = "string of blocks"
 * (ordenados, con gap que no puede contener objetos del tipo adyacente).
 * Bloques anidados = embebidos (monads ⊆ contexto). NORETRIEVE = el bloque
 * restringe pero sus objetos no se incluyen en el resultado.
 *
 * Semántica 1:1 con el manual de Emdros (MQL Query Guide §5.2, §6.1, §7.2):
 * el bloque más externo es el objeto encontrado; los internos lo constriñen.
 */

import { OlMonadSet } from "./monads.ts";
import type { EmdrosDb } from "./emdros-schema.ts";
import {
  enumName,
  enumValues,
  getObjectType,
  objectMonadSet,
  quoteIdent,
  resolveFeatureValue,
} from "./emdros-schema.ts";
import { OlMatchedObject, OlSheaf, OlStraw, OlTable, TableOrSheaf } from "./sheaf.ts";

/** Error MQL con campos db_error/compiler_error (como MqlException en PHP). */
export class MqlError extends Error {
  db_error: string | null;
  compiler_error: string | null;
  constructor(db_error: string | null, compiler_error: string | null) {
    super("MQL error");
    this.db_error = db_error;
    this.compiler_error = compiler_error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

type TokenType =
  | "ident" // feature name, otype, keyword, valor sin comillas
  | "string" // valor entre comillas dobles
  | "op" // = <> < <= > >= ~ !~
  | "lparen"
  | "rparen"
  | "comma"
  | "lbracket"
  | "rbracket";

interface Token {
  type: TokenType;
  text: string;
}

function isKeyword(text: string, kw: string): boolean {
  return text.toUpperCase() === kw;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      ++i;
      continue;
    }
    if (c === "/" && input[i + 1] === "/") {
      // Comentario hasta final de línea
      while (i < n && input[i] !== "\n") ++i;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < n && input[j] !== '"') s += input[j++];
      tokens.push({ type: "string", text: s });
      i = j + 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen", text: "(" });
      ++i;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", text: ")" });
      ++i;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma", text: "," });
      ++i;
      continue;
    }
    if (c === "[") {
      tokens.push({ type: "lbracket", text: "[" });
      ++i;
      continue;
    }
    if (c === "]") {
      tokens.push({ type: "rbracket", text: "]" });
      ++i;
      continue;
    }
    // Operadores de comparación
    if ("=<>!~".includes(c)) {
      let op = c;
      if (c === "<" || c === ">") {
        if (input[i + 1] === "=") {
          op += "=";
          ++i;
        } else if (input[i + 1] === ">") {
          op = "<>";
          ++i;
        }
      } else if (c === "!" && input[i + 1] === "~") {
        op = "!~";
        ++i;
      }
      tokens.push({ type: "op", text: op });
      ++i;
      continue;
    }
    // Identificador: letras, dígitos, guiones bajos, guiones (p. ej. I_Corinthians)
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
    if (m) {
      tokens.push({ type: "ident", text: m[0] });
      i += m[0].length;
      continue;
    }
    // Número (incluido negativo)
    const num = /^-?\d+/.exec(input.slice(i));
    if (num) {
      tokens.push({ type: "ident", text: num[0] });
      i += num[0].length;
      continue;
    }
    throw new MqlError(null, `MQL compiler error: unexpected character '${c}'`);
  }
  return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// AST de bloques
// ─────────────────────────────────────────────────────────────────────────────

export type Predicate =
  | { kind: "cmp"; feat: string; op: string; value: string }
  | { kind: "in"; feat: string; not: boolean; values: string[] }
  | { kind: "bool"; op: "AND" | "OR"; left: Predicate; right: Predicate }
  | { kind: "not"; sub: Predicate };

export interface Block {
  type: string;
  retrieve: boolean;
  getFeatures: string[] | null; // null = todas las features
  pred: Predicate | null;
  inner: Block[];
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private next(): Token {
    const t = this.peek();
    if (!t) throw new MqlError(null, "MQL compiler error: unexpected end of input");
    ++this.pos;
    return t;
  }

  private isKw(kw: string): boolean {
    const t = this.peek();
    return t !== null && t.type === "ident" && isKeyword(t.text, kw);
  }

  parseBlocks(): Block[] {
    const blocks: Block[] = [];
    while (this.peek()?.type === "lbracket") blocks.push(this.parseBlock());
    if (this.peek()) throw new MqlError(null, `MQL compiler error: unexpected token '${this.peek()!.text}'`);
    return blocks;
  }

  private parseBlock(): Block {
    this.next(); // '['
    const typeTok = this.next();
    if (typeTok.type !== "ident")
      throw new MqlError(null, "MQL compiler error: expected object type after '['");
    const block: Block = { type: typeTok.text, retrieve: true, getFeatures: null, pred: null, inner: [] };

    // Marcas y contenido del bloque (orden según §7.2.8 del manual)
    let t: Token | null;
    for (;;) {
      t = this.peek();
      if (!t || t.type === "rbracket") break;

      if (t.type === "lbracket") {
        block.inner.push(this.parseBlock());
        continue;
      }

      if (t.type === "ident" && isKeyword(t.text, "NORETRIEVE")) {
        block.retrieve = false;
        this.next();
        continue;
      }
      if (t.type === "ident" && isKeyword(t.text, "RETRIEVE")) {
        block.retrieve = true;
        this.next();
        continue;
      }
      if (t.type === "ident" && isKeyword(t.text, "GET")) {
        this.next();
        const feats: string[] = [];
        for (;;) {
          const ft = this.next();
          if (ft.type !== "ident") throw new MqlError(null, "MQL compiler error: expected feature name after GET");
          feats.push(ft.text);
          if (this.peek()?.type === "comma") this.next();
          else break;
        }
        block.getFeatures = feats;
        continue;
      }

      // Predicado (expresión booleana completa)
      block.pred = this.parseBoolExpr();
    }
    if (t && t.type === "rbracket") this.next();
    else throw new MqlError(null, "MQL compiler error: missing ']'");
    return block;
  }

  private parseBoolExpr(): Predicate {
    return this.parseOr();
  }

  private parseOr(): Predicate {
    let left = this.parseAnd();
    while (this.isKw("OR")) {
      this.next();
      const right = this.parseAnd();
      left = { kind: "bool", op: "OR", left, right };
    }
    return left;
  }

  private parseAnd(): Predicate {
    let left = this.parseNot();
    while (this.isKw("AND")) {
      this.next();
      const right = this.parseNot();
      left = { kind: "bool", op: "AND", left, right };
    }
    return left;
  }

  private parseNot(): Predicate {
    if (this.isKw("NOT")) {
      this.next();
      return { kind: "not", sub: this.parseNot() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Predicate {
    const t = this.peek();
    if (!t) throw new MqlError(null, "MQL compiler error: expected predicate");
    if (t.type === "lparen") {
      this.next();
      const e = this.parseBoolExpr();
      const r = this.next();
      if (r.type !== "rparen") throw new MqlError(null, "MQL compiler error: missing ')'");
      return e;
    }
    if (t.type !== "ident") throw new MqlError(null, "MQL compiler error: expected feature name");
    const feat = this.next().text;

    const opTok = this.peek();
    if (!opTok) throw new MqlError(null, "MQL compiler error: expected operator");

    if (opTok.type === "ident" && isKeyword(opTok.text, "IN")) {
      this.next();
      const lp = this.next();
      if (lp.type !== "lparen") throw new MqlError(null, "MQL compiler error: expected '(' after IN");
      const values: string[] = [];
      for (;;) {
        const v = this.next();
        if (v.type !== "ident" && v.type !== "string")
          throw new MqlError(null, "MQL compiler error: expected value in IN list");
        values.push(v.text);
        if (this.peek()?.type === "comma") this.next();
        else break;
      }
      const rp = this.next();
      if (rp.type !== "rparen") throw new MqlError(null, "MQL compiler error: missing ')' after IN list");
      return { kind: "in", feat, not: false, values };
    }

    if (opTok.type === "op") {
      this.next();
      const v = this.next();
      if (v.type !== "ident" && v.type !== "string")
        throw new MqlError(null, "MQL compiler error: expected value after operator");
      return { kind: "cmp", feat, op: opTok.text, value: v.text };
    }

    throw new MqlError(null, `MQL compiler error: expected operator after '${feat}'`);
  }
}

/** Parsea un conjunto de monads MQL: `{ 1, 4-8, 13 }` o `{{42}}`. */
export function parseMonadSetStr(str: string): OlMonadSet {
  const inner = str.trim().replace(/^{{/, "{").replace(/}}$/, "}").replace(/^{/, "").replace(/}$/, "");
  const ms = new OlMonadSet();
  if (inner.trim() === "") return ms;
  for (const part of inner.split(",")) {
    const p = part.trim();
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(p) ?? /^(-?\d+)$/.exec(p);
    if (!m) throw new MqlError(null, `MQL compiler error: invalid monad set '${str}'`);
    if (m[2] !== undefined) ms.addOne(parseInt(m[1], 10), parseInt(m[2], 10));
    else ms.addOne(parseInt(m[1], 10), parseInt(m[1], 10));
  }
  return ms;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación de predicados
// ─────────────────────────────────────────────────────────────────────────────

function isNumeric(s: string): boolean {
  return s !== "" && !Number.isNaN(Number(s));
}

function cmpValues(a: string, b: string, op: string): boolean {
  if (isNumeric(a) && isNumeric(b)) {
    const x = Number(a);
    const y = Number(b);
    switch (op) {
      case "=": return x === y;
      case "<>": return x !== y;
      case "<": return x < y;
      case "<=": return x <= y;
      case ">": return x > y;
      case ">=": return x >= y;
    }
  } else {
    switch (op) {
      case "=": return a === b;
      case "<>": return a !== b;
      case "<": return a < b;
      case "<=": return a <= b;
      case ">": return a > b;
      case ">=": return a >= b;
    }
  }
  return false;
}

/** Valor crudo de una feature (incluidas las virtuales monad/self). */
function rawValue(row: Record<string, unknown>, feat: string): unknown {
  if (feat === "monad") return row.first_monad;
  if (feat === "self" || feat === "object_id") return row.object_id_d;
  return row[`mdf_${feat}`];
}

/** ¿Es una feature enum real (no virtual) de este objeto type? */
function isEnumFeature(emd: EmdrosDb, otype: string, feat: string): boolean {
  const ot = emd.objectTypes.get(otype);
  const f = ot?.features.get(feat);
  return f !== undefined && f.kind === "enum";
}

/**
 * Comparación de enum tal como Emdros: el valor de consulta casa con el NOMBRE
 * del enum value ("Genesis", "verb") o, si es numérico, con su VALOR entero
 * ("4" para John, "5" para prep). En enums multi (columna TEXT como
 * ETCBC4.verb_class) "=" significa "contiene" y "<>" "no contiene".
 */
function enumMatches(
  emd: EmdrosDb,
  otype: string,
  feat: string,
  raw: unknown,
  value: string,
): boolean {
  const fi = emd.objectTypes.get(otype)!.features.get(feat)!;
  const vNum = isNumeric(value) ? Number(value) : null;
  if (fi.columnType === "TEXT" && typeof raw === "string") {
    const nums = raw
      .trim()
      .split(/\s+/)
      .filter((p) => p !== "")
      .map(Number);
    const names = nums.map((n) => enumValues(emd, fi.enumId!).get(n) ?? "");
    return names.includes(value) || (vNum !== null && nums.includes(vNum));
  }
  const name = resolveFeatureValue(emd, otype, feat, raw as number | string | null);
  return name === value || (vNum !== null && typeof raw === "number" && raw === vNum);
}

function evalPredicate(
  emd: EmdrosDb,
  otype: string,
  features: Map<string, string>,
  row: Record<string, unknown>,
  pred: Predicate,
): boolean {
  switch (pred.kind) {
    case "cmp": {
      const v = features.get(pred.feat);
      if (v === undefined) return false;
      if (pred.op === "~") return new RegExp(pred.value).test(v);
      if (pred.op === "!~") return !new RegExp(pred.value).test(v);
      if (isEnumFeature(emd, otype, pred.feat)) {
        const match = enumMatches(emd, otype, pred.feat, rawValue(row, pred.feat), pred.value);
        if (pred.op === "=") return match;
        if (pred.op === "<>") return !match;
        // Orden sobre enums: por nombre
        return cmpValues(v, pred.value, pred.op);
      }
      return cmpValues(v, pred.value, pred.op);
    }
    case "in": {
      const v = features.get(pred.feat);
      if (v === undefined) return false;
      const inList = isEnumFeature(emd, otype, pred.feat)
        ? pred.values.some((val) => enumMatches(emd, otype, pred.feat, rawValue(row, pred.feat), val))
        : pred.values.includes(v);
      return pred.not ? !inList : inList;
    }
    case "bool":
      return pred.op === "AND"
        ? evalPredicate(emd, otype, features, row, pred.left) && evalPredicate(emd, otype, features, row, pred.right)
        : evalPredicate(emd, otype, features, row, pred.left) || evalPredicate(emd, otype, features, row, pred.right);
    case "not":
      return !evalPredicate(emd, otype, features, row, pred.sub);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ejecución
// ─────────────────────────────────────────────────────────────────────────────

/** Feature `self` es virtual (id_d) en Emdros, igual que las features del esquema. */
function featureValue(
  emd: EmdrosDb,
  otype: string,
  feat: string,
  row: Record<string, unknown>,
): string | undefined {
  if (feat === "self" || feat === "object_id") return String(row.object_id_d);
  if (feat === "monad") return String(row.first_monad);
  const col = `mdf_${feat}`;
  if (!(col in row)) return undefined;
  return resolveFeatureValue(emd, otype, feat, row[col] as number | string | null);
}

interface Candidate {
  row: Record<string, unknown>;
  monads: OlMonadSet;
  features: Map<string, string>;
}

interface Options {
  /** Substrate: contexto del bloque superior (IN set) o universo completo. */
  substrate?: OlMonadSet;
  /** Modo GET OBJECTS HAVING MONADS IN: overlap en vez de subset. */
  having?: boolean;
  /** Solo monadsets (quick_harvest=true en Mql::exec): no expandir features. */
  quickHarvest?: boolean;
}

/** Recoge los nombres de features mencionados en un predicado. */
function collectPredFeats(pred: Predicate | null, acc: Set<string>): void {
  if (!pred) return;
  switch (pred.kind) {
    case "cmp":
    case "in":
      acc.add(pred.feat);
      break;
    case "bool":
      collectPredFeats(pred.left, acc);
      collectPredFeats(pred.right, acc);
      break;
    case "not":
      collectPredFeats(pred.sub, acc);
      break;
  }
}

function fetchCandidates(emd: EmdrosDb, block: Block, opts: Options): Candidate[] {
  const ot = getObjectType(emd, block.type);
  const table = quoteIdent(ot.table);
  const cols = ["object_id_d", "first_monad"];
  const colSet = new Set<string>(cols);
  if (ot.hasMonads) {
    cols.push("last_monad", "monads");
    colSet.add("last_monad");
    colSet.add("monads");
  }

  // Columnas de features: las de los predicados y GET del bloque. Sin GET,
  // Emdros devuelve todas las features del objeto (se omiten en quick_harvest).
  const toFetch = new Set<string>();
  collectPredFeats(block.pred, toFetch);
  if (block.getFeatures) {
    for (const f of block.getFeatures) toFetch.add(f);
  } else if (!opts.quickHarvest) {
    for (const f of ot.features.keys()) toFetch.add(f);
  }
  for (const f of toFetch) {
    if (f === "self" || f === "object_id" || f === "monad") continue;
    const col = `mdf_${f}`;
    if (!colSet.has(col) && ot.features.has(f)) {
      cols.push(col);
      colSet.add(col);
    }
  }

  let rows: Record<string, unknown>[] = [];
  const segments = opts.substrate?.segments;
  const sel = `SELECT ${cols.join(",")} FROM ${table}`;
  const rowsFor = (where: string, params: unknown[]): Record<string, unknown>[] => {
    return emd.db
      .prepare(`${sel} ${where} ORDER BY first_monad, object_id_d`)
      .all(...params) as Record<string, unknown>[];
  };

  if (segments && segments.length > 0) {
    if (opts.having) {
      // Overlap: el monset del objeto intersecta el contexto.
      // first_monad <= max_hi AND last_monad >= min_lo (si existe last_monad)
      const lo = segments[0].low;
      const hi = segments[segments.length - 1].high;
      if (colSet.has("last_monad")) {
        rows = rows.concat(rowsFor("WHERE first_monad <= ? AND last_monad >= ?", [hi, lo]));
      } else {
        // Objetos de monad único
        rows = rows.concat(rowsFor("WHERE first_monad BETWEEN ? AND ?", [lo, hi]));
      }
    } else {
      // Subset: primer monad dentro del contexto (índice *_fm_i)
      const where: string[] = [];
      const params: unknown[] = [];
      for (const s of segments) {
        where.push("first_monad BETWEEN ? AND ?");
        params.push(s.low, s.high);
      }
      rows = rows.concat(rowsFor(`WHERE ${where.join(" OR ")}`, params));
    }
  } else {
    rows = rows.concat(rowsFor("", []));
  }

  const segSet = new OlMonadSet(segments ?? []);
  const result: Candidate[] = [];
  for (const row of rows) {
    const monads = objectMonadSet(emd, ot.name, row);
    // Verificación de contexto
    if (segments && segments.length > 0) {
      if (opts.having) {
        if (!monads.overlaps(segSet)) continue;
      } else {
        if (!segSet.containsMonadSet(monads)) continue;
      }
    }
    result.push({ row, monads, features: new Map() });
  }
  return result;
}

/**
 * Encuentra objetos que satisfacen un bloque dentro de un contexto de monads.
 * Devuelve pares (candidato, straws de la string de bloques internos).
 */
/** Mapa de features de un candidato: columnas mdf_ + virtuales usadas en el
 *  predicado (monad/self/object_id, igual que el motor Emdros). */
function blockFeatures(emd: EmdrosDb, block: Block, c: Candidate): Map<string, string> {
  const features = new Map<string, string>();
  for (const key of Object.keys(c.row)) {
    if (!key.startsWith("mdf_")) continue;
    const f = key.slice(4);
    features.set(f, resolveFeatureValue(emd, block.type, f, c.row[key] as number | string | null));
  }
  if (block.pred) {
    const virtuals = new Set<string>();
    collectPredFeats(block.pred, virtuals);
    for (const v of virtuals) {
      if (v === "monad") features.set("monad", String(c.row.first_monad));
      else if (v === "self" || v === "object_id") features.set(v, String(c.row.object_id_d));
    }
  }
  return features;
}

function matchBlock(
  emd: EmdrosDb,
  block: Block,
  context: OlMonadSet,
  opts: Options,
): Candidate[] {
  const candidates = fetchCandidates(emd, block, { ...opts, substrate: context });
  const out: Candidate[] = [];
  for (const c of candidates) {
    c.features = blockFeatures(emd, block, c);
    if (block.pred && !evalPredicate(emd, block.type, c.features, c.row, block.pred)) continue;
    if (block.inner.length > 0) {
      // Verificar que existe una string de bloques internos embebida
      const hasInner = matchString(emd, block.inner, c.monads, opts);
      if (!hasInner) continue;
    }
    out.push(c);
  }
  return out;
}

/**
 * Semántica "string of blocks" (§5.3): los bloques al mismo nivel deben
 * encontrarse en orden (documento) sin solaparse; entre bloques puede haber
 * cualquier cosa excepto objetos de los tipos de los bloques adyacentes
 * (gap block con from-type-set = tipos de los bloques vecinos, §6.3.3).
 */
function matchString(
  emd: EmdrosDb,
  blocks: Block[],
  context: OlMonadSet,
  opts: Options,
): boolean {
  if (blocks.length === 0) return true;

  // Candidatos por bloque, dentro del contexto (los internos siempre subset)
  const candsPerBlock: Candidate[][] = [];
  for (const b of blocks) {
    const cs = fetchCandidates(emd, b, { ...opts, substrate: context, having: false });
    // Filtra por predicado del bloque
    const filtered: Candidate[] = [];
    for (const c of cs) {
      c.features = blockFeatures(emd, b, c);
      if (b.pred && !evalPredicate(emd, b.type, c.features, c.row, b.pred)) continue;
      filtered.push(c);
    }
    candsPerBlock.push(filtered);
  }

  // Búsqueda de una secuencia válida (backtracking con poda por posición)
  const gapTypes = new Set(blocks.map((b) => b.type));

  function findSeq(idx: number, prevEnd: number): boolean {
    if (idx === blocks.length) return true;
    for (const c of candsPerBlock[idx]) {
      const start = c.monads.low();
      const end = c.monads.high2();
      if (start <= prevEnd) continue; // debe ir después del anterior
      // El gap entre bloques consecutivos no puede contener objetos de gapTypes
      if (idx > 0 && !gapOk(emd, prevEnd + 1, start - 1, gapTypes)) continue;
      if (findSeq(idx + 1, end)) return true;
    }
    return false;
  }

  return findSeq(0, context.low() - 1);
}

/** El gap [lo,hi] no debe contener objetos de los tipos dados (§6.3.3). */
function gapOk(emd: EmdrosDb, lo: number, hi: number, gapTypes: Set<string>): boolean {
  if (hi < lo) return true;
  for (const t of gapTypes) {
    const ot = getObjectType(emd, t);
    const table = quoteIdent(ot.table);
    const hit = ot.hasMonads
      ? (emd.db
          .prepare(`SELECT object_id_d FROM ${table} WHERE first_monad <= ? AND last_monad >= ? LIMIT 1`)
          .get(hi, lo) as { object_id_d: number } | undefined)
      : (emd.db
          .prepare(`SELECT object_id_d FROM ${table} WHERE first_monad BETWEEN ? AND ? LIMIT 1`)
          .get(lo, hi) as { object_id_d: number } | undefined);
    if (hit) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública (Mql)
// ─────────────────────────────────────────────────────────────────────────────

export interface Mql {
  emd: EmdrosDb;
  mql_list: string;
  exec(mql_cmd: string, quick_harvest?: boolean): TableOrSheaf[];
}

/** Igual que Mql_native::exec: divide por GOqxqxqx y ejecuta cada comando. */
export function createMql(emd: EmdrosDb): Mql {
  return {
    emd,
    mql_list: "",
    exec(mql_cmd: string, quick_harvest = false): TableOrSheaf[] {
      this.mql_list += `${mql_cmd}\n`;
      const results: TableOrSheaf[] = [];
      const commands = mql_cmd.split(/\bGOqxqxqx\b/);
      for (let cmd of commands) {
        cmd = cmd.trim();
        if (cmd.length === 0) continue;
        results.push(execCommand(this.emd, cmd, quick_harvest));
      }
      return results;
    },
  };
}

function execCommand(emd: EmdrosDb, cmd: string, quick_harvest: boolean): TableOrSheaf {
  const upper = cmd.toUpperCase();

  if (upper === "SELECT MIN_M") {
    const t = new OlTable();
    t.set_header(["MIN_M"]);
    t.add_row([String(emd.minM)]);
    return tableResult(t);
  }
  if (upper === "SELECT MAX_M") {
    const t = new OlTable();
    t.set_header(["MAX_M"]);
    t.add_row([String(emd.maxM)]);
    return tableResult(t);
  }
  if (upper === "SELECT OBJECT TYPES") {
    const t = new OlTable();
    t.set_header(["ObjectType"]);
    for (const name of emd.objectTypes.keys()) t.add_row([name]);
    return tableResult(t);
  }
  const featM = /^SELECT\s+FEATURES\s+FROM\s+\[(\w+)\]/i.exec(cmd);
  if (featM) {
    const ot = getObjectType(emd, featM[1]);
    const t = new OlTable();
    t.set_header(["FeatureName", "Type"]);
    for (const f of ot.features.values()) {
      // Formato del motor Emdros: "integer", "string", "id_d",
      // "part_of_speech_t" y "list of verb_class_t" para enums multi
      let typ: string = f.kind;
      if (f.kind === "enum" && f.enumId !== null) {
        const name = enumName(emd, f.enumId) ?? "enum";
        typ = f.columnType === "TEXT" ? `list of ${name}` : name;
      }
      t.add_row([f.name, typ]);
    }
    return tableResult(t);
  }
  if (upper === "SELECT ENUMERATIONS") {
    const t = new OlTable();
    t.set_header(["EnumType"]);
    const rows = emd.db.prepare("SELECT enum_name FROM enumerations ORDER BY enum_id").all() as {
      enum_name: string;
    }[];
    for (const r of rows) t.add_row([r.enum_name]);
    return tableResult(t);
  }
  const enumM = /^SELECT\s+ENUMERATION\s+CONSTANTS\s+FROM\s+(\w+)/i.exec(cmd);
  if (enumM) {
    const t = new OlTable();
    t.set_header(["Constant"]);
    const rows = emd.db
      .prepare(
        "SELECT ec.enum_value_name FROM enumeration_constants ec JOIN enumerations e ON e.enum_id=ec.enum_id WHERE e.enum_name=? ORDER BY ec.rowid",
      )
      .all(enumM[1]) as { enum_value_name: string }[];
    for (const r of rows) t.add_row([r.enum_value_name]);
    return tableResult(t);
  }

  // Un monset es { ... } o el patrón {{n}}/{{set}} usado por Quiz_data/Dictionary
  const msetRe = "\\{\\{[^{}]*\\}\\}|\\{[^{}]*\\}";
  const allM = new RegExp(`^SELECT\\s+ALL\\s+OBJECTS\\s*(?:IN\\s+(${msetRe}))?\\s*WHERE\\s*([\\s\\S]*)$`, "i").exec(cmd);
  if (allM) {
    const set = allM[1] ? parseMonadSetStr(allM[1]) : undefined;
    const blocks = new Parser(tokenize(allM[2])).parseBlocks();
    if (blocks.length === 0) throw new MqlError(null, "MQL compiler error: empty query");
    const substrate = set ?? new OlMonadSet([{ low: emd.minM, high: emd.maxM }]);
    return execSelectAll(emd, blocks, substrate, quick_harvest);
  }

  const havingM = new RegExp(`^GET\\s+OBJECTS\\s+HAVING\\s+MONADS\\s+IN\\s+(${msetRe})\\s*([\\s\\S]*)$`, "i").exec(cmd);
  if (havingM) {
    const set = parseMonadSetStr(havingM[1]);
    const blocks = new Parser(tokenize(havingM[2])).parseBlocks();
    if (blocks.length === 0) throw new MqlError(null, "MQL compiler error: empty query");
    return execSelectAll(emd, blocks, set, quick_harvest, true);
  }

  throw new MqlError(null, `MQL compiler error: cannot parse command: ${cmd}`);
}

function tableResult(t: OlTable): TableOrSheaf {
  const tos = new TableOrSheaf();
  tos.set_table(t);
  return tos;
}

/** Ejecuta SELECT ALL OBJECTS / GET OBJECTS HAVING MONADS IN. */
function execSelectAll(
  emd: EmdrosDb,
  blocks: Block[],
  substrate: OlMonadSet,
  quick_harvest: boolean,
  having = false,
): TableOrSheaf {
  const top = blocks[0];
  // Bloques de feature-group (p.ej. [pgn GET ps,gn,nu] en el sentencegrammar):
  // no son object types; sus features se incorporan al GET del bloque padre.
  const groupFeats = flattenFeatureGroups(emd, top);
  if (groupFeats.length > 0) {
    top.getFeatures ??= [];
    for (const f of groupFeats) if (!top.getFeatures.includes(f)) top.getFeatures.push(f);
  }
  const matches = matchBlock(emd, top, substrate, { having, quickHarvest: quick_harvest });

  const sheaf = new OlSheaf();
  if (quick_harvest) {
    for (const m of matches) sheaf.add_monadset(m.monads);
    const tos = new TableOrSheaf();
    tos.set_sheaf(sheaf);
    return tos;
  }

  for (const m of matches) {
    if (!top.retrieve) continue;
    const straw = new OlStraw();
    const mo = makeMatchedObject(emd, top, m);
    straw.add_matched_object(mo);
    sheaf.add_straw(straw);
  }
  const tos = new TableOrSheaf();
  tos.set_sheaf(sheaf);
  return tos;
}

/**
 * Aplana bloques de feature-group (no object type, p.ej. `[pgn GET ps,gn,nu]`):
 * sus features GET se fusionan con las del bloque padre y el grupo se elimina.
 * Devuelve la lista de features aportada por los grupos (recursiva).
 */
function flattenFeatureGroups(emd: EmdrosDb, block: Block): string[] {
  const merged: string[] = [];
  const realInner: Block[] = [];
  for (const inner of block.inner) {
    if (emd.objectTypes.has(inner.type)) {
      realInner.push(inner);
      flattenFeatureGroups(emd, inner);
    } else {
      const groupFeats = flattenFeatureGroups(emd, inner);
      if (inner.getFeatures) for (const f of inner.getFeatures) groupFeats.push(f);
      merged.push(...groupFeats);
    }
  }
  block.inner = realInner;
  return merged;
}

function makeMatchedObject(emd: EmdrosDb, block: Block, c: Candidate): OlMatchedObject {  const mo = new OlMatchedObject(Number(c.row.object_id_d), block.type);
  mo.set_monadset(c.monads);
  const feats: Record<string, string> = {};
  if (block.getFeatures) {
    for (const f of block.getFeatures) {
      const v = featureValue(emd, block.type, f, c.row);
      if (v !== undefined) feats[f] = v;
    }
  } else {
    for (const [f, v] of c.features) feats[f] = v;
  }
  mo.set_features(feats);
  // Sheaf anidado con los objetos de la string de bloques internos
  if (block.inner.length > 0) {
    const innerSheaf = new OlSheaf();
    const innerMatches = matchStringInner(emd, block.inner, c.monads);
    for (const im of innerMatches) {
      const straw = new OlStraw();
      straw.add_matched_object(im);
      innerSheaf.add_straw(straw);
    }
    if (!innerSheaf.isEmpty()) mo.set_sheaf(innerSheaf);
  }
  return mo;
}

/** Devuelve los objetos de la primera string interna válida (por bloque). */
function matchStringInner(
  emd: EmdrosDb,
  blocks: Block[],
  context: OlMonadSet,
): OlMatchedObject[] {
  const result: OlMatchedObject[] = [];
  const candsPerBlock: Candidate[][] = [];
  for (const b of blocks) {
    const cs = fetchCandidates(emd, b, { substrate: context, having: false });
    const filtered: Candidate[] = [];
    for (const c of cs) {
      c.features = blockFeatures(emd, b, c);
      if (b.pred && !evalPredicate(emd, b.type, c.features, c.row, b.pred)) continue;
      filtered.push(c);
    }
    candsPerBlock.push(filtered);
  }

  const gapTypes = new Set(blocks.map((b) => b.type));

  function find(idx: number, prevEnd: number, acc: OlMatchedObject[]): boolean {
    if (idx === blocks.length) {
      result.push(...acc);
      return true;
    }
    for (const c of candsPerBlock[idx]) {
      if (c.monads.low() <= prevEnd) continue;
      if (idx > 0 && !gapOk(emd, prevEnd + 1, c.monads.low() - 1, gapTypes)) continue;
      const mo = makeMatchedObject(emd, blocks[idx], c);
      if (find(idx + 1, c.monads.high2(), acc.concat([mo]))) return true;
    }
    return false;
  }

  find(0, context.low() - 1, []);
  return result;
}
