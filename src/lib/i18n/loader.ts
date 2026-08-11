/**
 * Cargador de los diccionarios de interfaz `language/langsrc/{abb}/*_lang.php`.
 * La UI del port lee estos archivos (fuente de verdad) mezclados con las
 * traducciones editadas por el rol traductor (bol_language_{abb}), como el
 * legacy hace con `$this->lang->load(...)`. El cargador parsea una vez y
 * cachea en memoria.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { getAppDb } from "../db/sqlite.ts";
import { parseLangFile, parseCommentFile } from "./php-lang.ts";

const LANG_ROOT = path.join(process.cwd(), "language", "langsrc");

export const KNOWN_LANGS = [
  "am",
  "da",
  "de",
  "en",
  "es",
  "fr",
  "nl",
  "pt",
  "sw",
  "zh-Hans",
  "zh-Hant",
] as const;

export type LangCode = (typeof KNOWN_LANGS)[number];

/** Diccionario por textgroup: { group: { key: text } }. */
export type LangDictionary = Record<string, Record<string, string>>;

const cache = new Map<string, LangDictionary>();

function dirLangs(): string[] {
  if (!existsSync(LANG_ROOT)) return [];
  return readdirSync(LANG_ROOT).filter((d) => !d.startsWith("."));
}

/** Lista de idiomas con archivos langsrc disponibles. */
export function listLangSrcLangs(): string[] {
  return dirLangs().filter((l) => l !== "comment");
}

/** Overrides de la BD del rol traductor: bol_language_{abb} si existe la tabla. */
function dbOverrides(lang: string): LangDictionary | null {
  const abb = lang.replace(/[^a-zA-Z-]/g, "");
  if (abb !== lang) return null;
  try {
    const db = getAppDb();
    const has = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(`bol_language_${abb}`) as { name: string } | undefined;
    if (!has) return null;
    const rows = db.prepare(`SELECT textgroup, symbolic_name, text FROM bol_language_${abb}`).all() as {
      textgroup: string;
      symbolic_name: string;
      text: string;
    }[];
    const out: LangDictionary = {};
    for (const r of rows) {
      (out[r.textgroup] ??= {})[r.symbolic_name] = r.text;
    }
    return out;
  } catch {
    return null;
  }
}

/** Carga el diccionario completo de un idioma (cacheado). Si no existe, "en". */
export function loadLangDictionary(lang: string): LangDictionary {
  const resolved = lang && existsSync(path.join(LANG_ROOT, lang)) ? lang : "en";
  const hit = cache.get(resolved);
  if (hit) return hit;
  const files = readdirSync(path.join(LANG_ROOT, resolved)).filter((f) => f.endsWith("_lang.php"));
  const dict: LangDictionary = {};
  for (const f of files) {
    const group = f.replace(/_lang\.php$/, "");
    const php = readFileSync(path.join(LANG_ROOT, resolved, f), "utf8");
    dict[group] = parseLangFile(php);
  }
  const ov = dbOverrides(resolved);
  if (ov) {
    for (const [group, keys] of Object.entries(ov)) {
      const gd = (dict[group] ??= {});
      for (const [key, text] of Object.entries(keys)) gd[key] = text;
    }
  }
  cache.set(resolved, dict);
  return dict;
}

/** Línea del diccionario con fallback: idioma → en → clave literal. */
export function langLine(lang: string, group: string, key: string): string {
  const dict = loadLangDictionary(lang);
  const groupDict = dict[group];
  if (groupDict && groupDict[key] !== undefined) return groupDict[key];
  if (lang !== "en") {
    const en = loadLangDictionary("en");
    const enGroup = en[group];
    if (enGroup && enGroup[key] !== undefined) return enGroup[key];
  }
  return key;
}

/** t(key): `$this->lang->line($key)` del legacy — busca la clave en todos los grupos. */
export function langText(lang: string, key: string): string {
  const dict = loadLangDictionary(lang);
  for (const gd of Object.values(dict)) {
    if (gd[key] !== undefined) return gd[key];
  }
  if (lang !== "en") {
    for (const gd of Object.values(loadLangDictionary("en"))) {
      if (gd[key] !== undefined) return gd[key];
    }
  }
  return key;
}

export interface LangComment {
  comment: Record<string, string>;
  format: Record<string, string>;
  use_textarea: Record<string, boolean>;
}

const commentCache = new Map<string, LangComment>();

/** Cargador de los archivos de comentarios (`comment/*_lang.php`). */
export function loadLangComment(group: string): LangComment {
  const hit = commentCache.get(group);
  if (hit) return hit;
  const f = path.join(LANG_ROOT, "comment", `${group}_lang.php`);
  const res = existsSync(f) ? parseCommentFile(readFileSync(f, "utf8")) : { comment: {}, format: {}, use_textarea: {} };
  commentCache.set(group, res);
  return res;
}

/** Lista de textgroups existentes (grupos de langsrc, sin "comment"). */
export function listTextgroups(): string[] {
  const en = readdirSync(path.join(LANG_ROOT, "en")).filter((f) => f.endsWith("_lang.php"));
  return en.map((f) => f.replace(/_lang\.php$/, "")).sort();
}
