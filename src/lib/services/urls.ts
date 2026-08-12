/**
 * services/urls.ts — Port de Mod_urls.php + Ctrl_urls (URLs para glosas).
 *
 * El legacy consulta las tablas `lexicon_<lang>`/`lexicon_<lang>_en` (espejo
 * en data/lexicons.db) y `heb_urls`/`bible_urls`/`bible_refs` (bol_*, BD de
 * aplicación). La consulta de lexicons usa la misma BD readonly que
 * src/lib/corpus/lexicon.ts (data/lexicons.db).
 */

import path from "node:path";
import Database from "better-sqlite3";
import { DATA_DIR, getAppDb } from "../db/sqlite.ts";

export interface LexemeRow {
  lex: string;
  vocalized_lexeme_utf8: string;
  roman: string;
  gloss: string;
  tally: number;
  vs: string;
  urls?: HebUrlRow[];
}

export interface HebUrlRow {
  id: number;
  lex: string;
  language: string;
  url: string;
  icon: string;
}

let lexDb: Database.Database | null = null;

/** BD readonly con el espejo de lexicon_* (data/lexicons.db). */
export function getLexDb(): Database.Database {
  if (!lexDb) lexDb = new Database(path.join(DATA_DIR, "lexicons.db"), { readonly: true });
  return lexDb;
}

export function closeLexDb(): void {
  lexDb?.close();
  lexDb = null;
}

/** src_lang_short2long: 'heb'→'Hebrew', 'aram'→'Aramaic', 'greek', 'latin'. */
export function srcLangShort2long(srclang: string): string {
  switch (srclang) {
    case "heb":
      return "Hebrew";
    case "aram":
      return "Aramaic";
    case "greek":
      return "greek";
    case "latin":
      return "latin";
  }
  throw new Error("illegal_lang_code");
}

/** Botones cortos de hebreo (view_select_gloss, editing='url' y editors). */
export function getHebButtons(): [string, string, string][] {
  return [
    ["&#x05d0;&#x05d1;-&#x05d0;&#x05d9;", "ab", "ak"],
    ["&#x05d0;&#x05db;-&#x05d0;&#x05e8;", "ak", "au"],
    ["&#x05d0;&#x05e9;-&#x05d1;&#x05e1;", "au", "bp"],
    ["&#x05d1;&#x05e2;-&#x05d2;&#x05d6;", "bp", "ch"],
    ["&#x05d2;&#x05d7;-&#x05d3;&#x05e7;", "ch", "dt"],
    ["&#x05d3;&#x05e8;-&#x05d6;&#x05e7;", "dt", "gt"],
    ["&#x05d6;&#x05e8;-&#x05d7;&#x05dc;", "gt", "hm"],
    ["&#x05d7;&#x05de;-&#x05d7;&#x05e9;", "hm", "hv"],
    ["&#x05d7;&#x05ea;-&#x05d9;&#x05db;", "hv", "jl"],
    ["&#x05d9;&#x05dc;-&#x05db;&#x05d1;", "jl", "kd"],
    ["&#x05db;&#x05d3;-&#x05dc;&#x05d5;", "kd", "lg"],
    ["&#x05dc;&#x05d6;-&#x05de;&#x05d6;", "lg", "mh"],
    ["&#x05de;&#x05d7;-&#x05de;&#x05e1;", "mh", "mp"],
    ["&#x05de;&#x05e2;-&#x05de;&#x05e9;", "mp", "mv"],
    ["&#x05de;&#x05ea;-&#x05e0;&#x05e2;", "mv", "nq"],
    ["&#x05e0;&#x05e4;-&#x05e1;&#x05e2;", "nq", "oq"],
    ["&#x05e1;&#x05e4;-&#x05e2;&#x05db;", "oq", "pl"],
    ["&#x05e2;&#x05dc;-&#x05e2;&#x05e9;", "pl", "pv"],
    ["&#x05e2;&#x05ea;-&#x05e4;&#x05e8;", "pv", "qu"],
    ["&#x05e4;&#x05e9;-&#x05e7;&#x05d0;", "qu", "sb"],
    ["&#x05e7;&#x05d1;-&#x05e7;&#x05e9;", "sb", "ta"],
    ["&#x05e8;&#x05d0;-&#x05e8;&#x05e4;", "ta", "tr"],
    ["&#x05e8;&#x05e6;-&#x05e9;&#x05d7;", "tr", "ui"],
    ["&#x05e9;&#x05d8;-&#x05e9;&#x05e2;", "ui", "uq"],
    ["&#x05e9;&#x05e4;-&#x05ea;&#x05de;", "uq", "vn"],
    ["&#x05ea;&#x05e0;-&#x05ea;&#x05e9;", "vn", "zz"],
  ];
}

/** Botones cortos de arameo. */
export function getAramButtons(): [string, string, string][] {
  return [
    ["&#x05d0;&#x05d1;-&#x05de;&#x05d5;", "ab", "mg"],
    ["&#x05de;&#x05d6;-&#x05ea;&#x05ea;", "mg", "zz"],
  ];
}

/** Mod_urls::get_glosses — glosas en un rango de sortorder, una por lexema. */
export function getGlosses(language: string, from: string, to: string): LexemeRow[] {
  const db = getLexDb();
  const rows = db
    .prepare(
      `SELECT he.lex, he.vs, he.vocalized_lexeme_utf8, he.roman, he.tally, en.gloss
       FROM lexicon_${language} he JOIN lexicon_${language}_en en ON en.lex_id = he.id
       WHERE he.sortorder >= ? AND he.sortorder < ?
       ORDER BY he.sortorder, he.roman`,
    )
    .all(from, to) as LexemeRow[];

  const result: LexemeRow[] = [];
  let lastLex = "";
  for (const row of rows) {
    if (row.lex !== lastLex) {
      result.push(row);
      lastLex = row.lex;
    }
  }
  return result;
}

/** Mod_urls::get_frequent_glosses — las n glosas más frecuentes (1 por lexema). */
export function getFrequentGlosses(language: string, glossCount: number): LexemeRow[] {
  const db = getLexDb();
  const rows = db
    .prepare(
      `SELECT he.lex, he.vs, he.vocalized_lexeme_utf8, he.roman, he.tally, en.gloss
       FROM lexicon_${language} he JOIN lexicon_${language}_en en ON en.lex_id = he.id
       ORDER BY he.tally DESC LIMIT ?`,
    )
    .all(2 * glossCount) as LexemeRow[];

  const result: LexemeRow[] = [];
  let tallyBreak = 0;
  let lastLex = "";
  for (const row of rows) {
    if (row.lex !== lastLex) {
      if (result.length >= glossCount) {
        if (tallyBreak > row.tally) break;
      }
      result.push(row);
      lastLex = row.lex;
      if (result.length === glossCount) tallyBreak = row.tally;
    }
  }
  if (result.length < glossCount) {
    throw new Error("assert: get_frequent_glosses no alcanzó gloss_count");
  }
  return result;
}

/** Mod_urls::get_heb_urls — URLs por lexema (muta los objetos word con .urls). */
export function getHebUrls(language: string, words: LexemeRow[]): void {
  const db = getAppDb();
  const stmt = db.prepare("SELECT id, lex, language, url, icon FROM bol_heb_urls WHERE lex = ? AND language = ?");
  for (const w of words) {
    const urls = stmt.all(w.lex, language) as HebUrlRow[];
    if (urls.length > 0) w.urls = urls;
  }
}

/** Mod_urls::set_heb_url — actualiza link/icono de una URL existente. */
export function setHebUrl(id: number, link: string, icon: string): void {
  getAppDb().prepare("UPDATE bol_heb_urls SET url = ?, icon = ? WHERE id = ?").run(link, icon, id);
}

/** Mod_urls::create_heb_url — crea una URL para un lexema. */
export function createHebUrl(lex: string, language: string, link: string, icon: string): void {
  getAppDb().prepare("INSERT INTO bol_heb_urls (lex, language, url, icon) VALUES (?, ?, ?, ?)").run(
    lex, language, link, icon,
  );
}

/** Mod_urls::delete_heb_url. */
export function deleteHebUrl(id: number): void {
  getAppDb().prepare("DELETE FROM bol_heb_urls WHERE id = ?").run(id);
}

export { ICON_NAMES, iconCssClass } from "./icons.ts";