/**
 * lexicon.ts — Capa de datos indirectos de Dictionary (indirectLookup).
 *
 * En el legacy, `indirdb: "mysql"` apuntaba a la BD MySQL bol_* y los demás
 * indirdb a archivos SQLite de `db/`. Aquí todo es SQLite:
 *   - "mysql"            → data/lexicons.db (espejo de las tablas bol_lexicon_*)
 *   - "ETCBC4_hints.db"  → data/hints/ETCBC4_hints.db (y demás archivos)
 *
 * La sustitución de argumentos es vsprintf de PHP (%1$s posicional, %s/%d
 * secuenciales) y {PRE} (prefijo de tablas del legacy) se elimina.
 */

import Database from "better-sqlite3";
import path from "node:path";
import { DATA_DIR } from "../db/sqlite.ts";
import { htmlSpecialChars, htmlSpecialCharsDecode } from "./sheaf.ts";

const MYSQL = "mysql";

const handles = new Map<string, Database.Database>();

/** Abre (o reutiliza) la BD para un indirdb. */
function getDb(indirdb: string): Database.Database {
  const cached = handles.get(indirdb);
  if (cached) return cached;
  const file =
    indirdb === MYSQL
      ? path.join(DATA_DIR, "lexicons.db")
      : path.join(DATA_DIR, "hints", indirdb);
  const db = new Database(file, { readonly: true });
  handles.set(indirdb, db);
  return db;
}

/** Sustitución tipo vsprintf de PHP: %1$s/%2$s posicionales y %s/%d en orden. */
export function vsprintf(fmt: string, args: string[]): string {
  let argi = 0;
  return fmt.replace(/%%|%(?:\d+\$)?[sd]/g, (m) => {
    if (m === "%%") return "%";
    const pos = /^%(\d+)\$/.exec(m);
    let value: string;
    if (pos) {
      value = args[parseInt(pos[1], 10) - 1] ?? "";
    } else {
      value = args[argi++] ?? "";
    }
    return /^%[^sd]*d/.test(m) ? String(parseInt(value, 10) || 0) : value;
  });
}

/** Configuración de una feature indirecta (featuresetting del dbinfo). */
export interface IndirectFsetting {
  indirdb: string;
  sql_command?: string;
  sql_command_variant?: string;
  sqlargs?: string[];
  multiple?: boolean;
  isGloss?: boolean;
}

export type IndirectValue =
  | string
  | Record<string, string>
  | Array<string | Record<string, string>>;

/**
 * Consulta indirecta (Dictionary::indirectLookup). `features` son las del
 * OlMatchedObject (codificadas con htmlspecialchars, como en el legacy);
 * el resultado se devuelve codificado y se cachea por clave.
 */
export class IndirectLookup {
  private cache = new Map<string, IndirectValue>();

  lookup(
    feat: string,
    features: Record<string, string>,
    fsetting: IndirectFsetting,
    glosslimit: number,
    testGlosslimit: boolean,
  ): IndirectValue | undefined {
    if (testGlosslimit && fsetting.isGloss) {
      const rank = parseInt(features["frequency_rank"] ?? "0", 10);
      if (rank <= glosslimit) return "&#x26d4;"; // No entry sign
    }

    const keyArray = (fsetting.sqlargs ?? []).map((a) => htmlSpecialCharsDecode(features[a] ?? ""));
    const key = keyArray.join(",") + "," + feat;

    let hit = this.cache.get(key);
    if (hit === undefined) {
      const db = getDb(fsetting.indirdb);
      const sql = (fsetting.sql_command_variant ?? fsetting.sql_command) ?? "";
      const query = vsprintf(sql.replace(/\{PRE\}/g, ""), keyArray);
      const rows = db.prepare(query).all() as Record<string, unknown>[];

      if (fsetting.multiple) {
        hit = rows.map((row) => encodeRow(row)) as IndirectValue;
      } else if (rows.length > 0) {
        hit = encodeRow(rows[0]);
      } else {
        hit = "*";
      }
      this.cache.set(key, hit);
    }
    return hit;
  }
}

/** Codifica una fila: 1 columna → string; varias → objeto (como PHP). */
function encodeRow(row: Record<string, unknown>): string | Record<string, string> {
  const cols = Object.keys(row);
  if (cols.length === 1) return htmlSpecialChars(row[cols[0]] as string | number | null);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) out[k] = htmlSpecialChars(v as string | number | null);
  return out;
}

/** Cierra las BD indirectas (tests/recarga). */
export function closeIndirectDbs(): void {
  for (const h of handles.values()) h.close();
  handles.clear();
}
