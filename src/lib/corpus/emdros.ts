/**
 * emdros.ts — open_emdros(): gestor de corpora abiertos (port de
 * Mql.php + Mod_askemdros::setup). Abre por propertiesName (ETCBC4,
 * ETCBC4-translit, nestle1904, jvulgate), resuelve el archivo de corpus
 * vía databaseName y expone consultas MQL con caché por proceso.
 */

import Database from "better-sqlite3";
import { META_DIR, openCorpusDb } from "../db/sqlite.ts";
import { DbConfig } from "./db-config.ts";
import { openEmdros, type EmdrosDb } from "./emdros-schema.ts";
import { createMql, type Mql } from "./mql.ts";
import { OlMonadSet } from "./monads.ts";
import { htmlSpecialChars } from "./sheaf.ts";

export interface CorpusHandle {
  /** propertiesName (clave del caché) */
  prop: string;
  /** databaseName → archivo del corpus (ETCBC4 para ETCBC4-translit) */
  databaseName: string;
  db: Database.Database;
  emd: EmdrosDb;
  mql: Mql;
  dbconfig: DbConfig;
}

/** Orden de presentación de los corpora (db_and_books). */
const SORT_ORDER: Record<string, number> = {
  ETCBC4: 1,
  "ETCBC4-translit": 2,
  nestle1904: 3,
  jvulgate: 4,
};

const handles = new Map<string, CorpusHandle>();

/** open_emdros($db, $prop) — devuelve (o crea) el handle del corpus. */
export function getEmdros(prop: string, metaDir = META_DIR): CorpusHandle {
  const cached = handles.get(prop);
  if (cached) return cached;

  const dbconfig = new DbConfig(metaDir);
  dbconfig.initConfig(prop, prop, "en");
  const databaseName = (JSON.parse(dbconfig.dbinfo_json) as { databaseName: string }).databaseName;
  const db = openCorpusDb(databaseName);
  const emd = openEmdros(db, databaseName);
  const handle: CorpusHandle = { prop, databaseName, db, emd, mql: createMql(emd), dbconfig };
  handles.set(prop, handle);
  return handle;
}

/** fullUniverse(): min..max monad del corpus. */
export function fullUniverse(handle: CorpusHandle): OlMonadSet {
  const rows = handle.mql.exec("SELECT MIN_M GOqxqxqx\nSELECT MAX_M GOqxqxqx\n");
  const low = Number(rows[0].get_table()!.get_cell(0, 0));
  const high = Number(rows[1].get_table()!.get_cell(0, 0));
  return new OlMonadSet([{ low, high }]);
}

/** getMonadsAtLevel(): objetos del nivel jerárquico dado dentro de ms. */
export function getMonadsAtLevel(handle: CorpusHandle, ms: OlMonadSet, hierLevel: number): Record<string, OlMonadSet> {
  const hier = (JSON.parse(handle.dbconfig.dbinfo_json) as { universeHierarchy: { type: string; feat: string }[] })
    .universeHierarchy[hierLevel];
  const rows = handle.mql.exec(`SELECT ALL OBJECTS IN ${ms} WHERE [${hier.type} GET ${hier.feat}] GOqxqxqx\n`);  const sh = rows[0].get_sheaf()!;
  const res: Record<string, OlMonadSet> = {};
  for (const straw of sh.get_straws()) {
    const mo = straw.get_first_matched_object();
    const feat = mo.get_feature(hier.feat) as string | number;
    res[String(feat)] = mo.get_monadset();
  }
  return res;
}

/**
 * find_monads(): monadset de un pasaje. $vfrom===0 → capítulo completo.
 * Lanza Error('no_text_found') si el pasaje no existe.
 */
export function findMonads(
  handle: CorpusHandle,
  book: string,
  chapter: number,
  vfrom: number,
  vto: number,
): OlMonadSet {
  const cmd =
    vfrom === 0
      ? `SELECT ALL OBJECTS WHERE [chapter book=${book} AND chapter=${chapter}] GOqxqxqx\n`
      : `SELECT ALL OBJECTS WHERE [verse book=${book} AND chapter=${chapter} `
        + `AND verse>=${vfrom} AND verse<=${vto}] GOqxqxqx\n`;
  const rows = handle.mql.exec(cmd);
  const sh = rows[0].get_sheaf()!;
  if (sh.isEmpty()) throw new Error("no_text_found");

  const mset = new OlMonadSet();
  for (const straw of sh.get_straws()) {
    for (const mo of straw.get_matched_objects()) mset.addSet(mo.get_monadset());
  }
  return mset;
}

export interface DbBooks {
  name: string;
  databaseName: string;
  loc_desc: string;
  loc_copyright: string | null;
  loc_books: Record<string, string>;
  order: string[][];
}

/** db_and_books(): corpora enumerados con descripción localizada y orden de libros. */
export function dbAndBooks(language = "en", metaDir = META_DIR): DbBooks[] {
  const cfg = new DbConfig(metaDir);
  const db_books: DbBooks[] = [];
  for (const name of Object.keys(cfg.allfiles_enumerate)) {
  cfg.initConfig(name, name, language);
  const dbinfo = JSON.parse(cfg.dbinfo_json) as { databaseName: string };
  const loc = JSON.parse(cfg.l10n_json) as {
    dbdescription: string;
    dbcopyright?: string;
    universe: { book: Record<string, string> };
  };
  db_books.push({
    name,
    databaseName: dbinfo.databaseName,
      loc_desc: loc.dbdescription,
      loc_copyright: loc.dbcopyright ?? null,
      loc_books: loc.universe.book,
      order: cfg.bookorder,
    });
  }
  db_books.sort((a, b) => (SORT_ORDER[a.name] ?? 99) - (SORT_ORDER[b.name] ?? 99));
  return db_books;
}

/** shebanq_link(): enlace a SHEBANQ solo para los corpora hebreos. */
export function shebanqLink(db: string, book: string, chapter: number): string | null {
  if (db === "ETCBC4" || db === "ETCBC4-translit") {
    return `http://shebanq.ancient-data.org/hebrew/text?book=${encodeURIComponent(book)}&chapter=${chapter}&mr=m`;
  }
  return null;
}

/** Formato del error MQL para mostrar al usuario (Mod_askemdros::show_text). */
export function mqlErrorMessage(e: { db_error?: string; compiler_error?: string }): string {
  const msg = e.db_error ? `mql_database_error_colon\n${e.db_error}` : `mql_compiler_error_colon\n${e.compiler_error}`;
  return htmlSpecialChars(msg).replace(/\n/g, "<br>");
}

/** Cierra todos los corpora abiertos (para tests/recarga). */
export function closeAllEmdros(): void {
  for (const h of handles.values()) h.db.close();
  handles.clear();
}
