/**
 * translate.ts — Port de `Mod_translate.php` + `Ctrl_translate.php` para el
 * rol traductor: editor de cadenas de interfaz (if_*) y de gramática
 * (gram_*). La BD guarda las traducciones (override de los langsrc), y la
 * UI se sirve de la mezcla langsrc + BD (ver src/lib/i18n/loader.ts).
 */

import { getAppDb } from "../db/sqlite.ts";
import { META_DIR } from "../db/sqlite.ts";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { listTextgroups, loadLangComment, loadLangDictionary, listLangSrcLangs } from "../i18n/loader.ts";

/** Nombres de tablas de idioma: bol_language_{abb}. */
function qt(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
function langTable(abb: string): string {
  return qt(`bol_language_${abb}`);
}

const ALLOWED_ABB = /^[a-zA-Z][a-zA-Z-_]*$/;

function cleanAbb(abb: string): string {
  if (!ALLOWED_ABB.test(abb)) throw new Error(`Illegal language code: ${abb}`);
  return abb;
}

/** if_create_table: crea la tabla de idioma si no existe (como language_{abb}). */
export function ensureLangTable(abb: string): void {
  const t = langTable(cleanAbb(abb));
  getAppDb().exec(`
    CREATE TABLE IF NOT EXISTS ${t} (
      id INTEGER NOT NULL,
      textgroup TEXT NOT NULL,
      symbolic_name TEXT NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (id)
    );
  `);
  getAppDb().exec(`CREATE INDEX IF NOT EXISTS ${qt(`idx_${t.replace(/"/g, "")}_tg`)} ON ${t} (textgroup);`);
}

/** if_php2db (idempotente): importa langsrc → BD para un idioma. */
export function importLangFromSrc(abb: string): void {
  const t = langTable(cleanAbb(abb));
  ensureLangTable(abb);
  const db = getAppDb();
  const existing = new Set(
    (db.prepare(`SELECT textgroup, symbolic_name FROM ${t}`).all() as { textgroup: string; symbolic_name: string }[])
      .map((r) => `${r.textgroup}\u0000${r.symbolic_name}`),
  );
  const insert = db.prepare(`INSERT INTO ${t} (textgroup, symbolic_name, text) VALUES (?, ?, ?)`);
  const dict = loadLangDictionary(abb);
  db.transaction(() => {
    for (const [group, keys] of Object.entries(dict)) {
      for (const [key, text] of Object.entries(keys)) {
        if (existing.has(`${group}\u0000${key}`)) continue;
        insert.run(group, key, text);
        existing.add(`${group}\u0000${key}`);
      }
    }
  })();
}

/** if_phpcomment2db (idempotente): importa comment/*_lang.php → bol_language_comment. */
export function importCommentFromSrc(): void {
  const db = getAppDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS bol_language_comment (
      id INTEGER NOT NULL,
      textgroup TEXT NOT NULL,
      symbolic_name TEXT NOT NULL,
      comment TEXT,
      format TEXT,
      use_textarea INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id)
    );
  `);
  const existing = new Set(
    (db.prepare("SELECT textgroup, symbolic_name FROM bol_language_comment").all() as {
      textgroup: string;
      symbolic_name: string;
    }[]).map((r) => `${r.textgroup}\u0000${r.symbolic_name}`),
  );
  const insert = db.prepare(
    "INSERT INTO bol_language_comment (textgroup, symbolic_name, comment, format, use_textarea) VALUES (?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    for (const group of listTextgroups()) {
      const { comment, format, use_textarea } = loadLangComment(group);
      for (const key of Object.keys(comment)) {
        if (existing.has(`${group}\u0000${key}`)) continue;
        insert.run(group, key, comment[key] || null, format[key] || null, use_textarea[key] ? 1 : 0);
        existing.add(`${group}\u0000${key}`);
      }
    }
  })();
}

/** get_all_if_languages: abb → nombre nativo (de bol_translation_languages). */
export function getIfLanguages(): Record<string, string> {
  const rows = getAppDb()
    .prepare("SELECT abb, native FROM bol_translation_languages WHERE iface_enabled = 1")
    .all() as { abb: string; native: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.abb] = r.native;
  return out;
}

/** get_all_db: corpora con localización de gramática. */
export function getDbList(): string[] {
  return ["ETCBC4", "ETCBC4-translit", "nestle1904", "jvulgate"];
}

/** get_textgroup_list: grupos canónicos (textgroup) desde bol_language_comment. */
export function getTextgroupList(): string[] {
  return (getAppDb().prepare("SELECT DISTINCT textgroup FROM bol_language_comment ORDER BY textgroup").all() as { textgroup: string }[]).map(
    (r) => r.textgroup,
  );
}

/** count_if_lines(textgroup?) — claves canónicas. */
export function countIfLines(textgroup: string | null): number {
  const db = getAppDb();
  if (textgroup)
    return (db.prepare("SELECT COUNT(*) n FROM bol_language_comment WHERE textgroup = ?").get(textgroup) as { n: number }).n;
  return (db.prepare("SELECT COUNT(*) n FROM bol_language_comment").get() as { n: number }).n;
}

/** count_if_translated(abb) — claves con texto en la tabla del idioma. */
export function countIfTranslated(abb: string): number {
  const t = langTable(cleanAbb(abb));
  ensureLangTable(abb);
  const db = getAppDb();
  return (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
}

export interface IfLine {
  symbolic_name: string;
  comment: string | null;
  use_textarea: number;
  text_show: string | null;
  text_edit: string | null;
}

/** get_if_lines_part: filas canónicas con texto mostrado y editable. */
export function getIfLinesPart(
  langEdit: string,
  langShow: string,
  textgroup: string,
  limit: number,
  offset: number,
  orderby: string,
  sortorder: string,
): IfLine[] {
  const te = langTable(cleanAbb(langEdit));
  const ts = langTable(cleanAbb(langShow));
  ensureLangTable(langEdit);
  ensureLangTable(langShow);
  const col = orderby === "text_show" ? "s.text" : orderby === "text_edit" ? "e.text" : "c.symbolic_name";
  const dir = sortorder === "desc" ? "DESC" : "ASC";
  const db = getAppDb();
  return db
    .prepare(
      `SELECT c.symbolic_name symbolic_name, c.comment comment, c.use_textarea use_textarea,
              s.text text_show, e.text text_edit
       FROM bol_language_comment c
       LEFT JOIN ${ts} s ON s.symbolic_name = c.symbolic_name AND s.textgroup = c.textgroup
       LEFT JOIN ${te} e ON e.symbolic_name = c.symbolic_name AND e.textgroup = c.textgroup
       WHERE c.textgroup = ?
       ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`,
    )
    .all(textgroup, limit, offset) as IfLine[];
}

/** get_if_untranslated: claves sin texto en el idioma editable. */
export function getIfUntranslated(langEdit: string): { symbolic_name: string; textgroup: string }[] {
  const te = langTable(cleanAbb(langEdit));
  ensureLangTable(langEdit);
  const db = getAppDb();
  return db
    .prepare(
      `SELECT c.symbolic_name symbolic_name, c.textgroup textgroup
       FROM bol_language_comment c
       LEFT JOIN ${te} e ON e.symbolic_name = c.symbolic_name AND e.textgroup = c.textgroup
       WHERE e.text IS NULL
       ORDER BY c.textgroup, c.symbolic_name`,
    )
    .all() as { symbolic_name: string; textgroup: string }[];
}

/**
 * update_if_lines: guarda las cadenas modificadas (claves "modif-<key>" del
 * POST). Replica el comportamiento de idioma + variantes: si hay variante
 * activa y el texto es vacío o igual a la base, se borra la fila de variante.
 */
export function updateIfLines(
  langEdit: string,
  textgroup: string,
  post: Record<string, string>,
  variant: string | null,
): void {
  let target = langEdit;
  if (variant) {
    target = `${langEdit}_${variant}`;
    ensureLangTable(target);
  } else {
    ensureLangTable(langEdit);
  }
  const db = getAppDb();
  const base = variant ? langTable(langEdit) : null;
  if (base) ensureLangTable(langEdit);

  const del = db.prepare(`DELETE FROM ${langTable(target)} WHERE textgroup = ? AND symbolic_name = ?`);
  const ins = db.prepare(`INSERT INTO ${langTable(target)} (textgroup, symbolic_name, text) VALUES (?, ?, ?)`);
  const upd = db.prepare(`UPDATE ${langTable(target)} SET text = ? WHERE textgroup = ? AND symbolic_name = ?`);
  const getBase = base
    ? db.prepare(`SELECT text FROM ${base} WHERE textgroup = ? AND symbolic_name = ?`)
    : null;

  db.transaction(() => {
    for (const [key, modif] of Object.entries(post)) {
      if (!key.startsWith("modif-") || modif !== "true") continue;
      const key2 = key.slice(6);
      const text = (post[key2] ?? "").trim();
      let deleted = false;
      if (variant && getBase) {
        const row = getBase.get(textgroup, key2) as { text: string } | undefined;
        if (!text || (row && row.text === text)) {
          del.run(textgroup, key2);
          deleted = true;
        }
      }
      if (!deleted) {
        const exists = db.prepare(`SELECT id FROM ${langTable(target)} WHERE textgroup = ? AND symbolic_name = ?`).get(textgroup, key2);
        if (!exists) ins.run(textgroup, key2, text);
        else upd.run(text, textgroup, key2);
      }
    }
  })();
}

// ─────────────────────────────────────────────────────────────────────────────
// Gramática (Mod_translate::get_grammar_* / update_grammar_lines)
//   Fuente: bol_db_localize (db, lang) con fallback a data/meta/<db>.<lang>.prop.pretty.json
// ─────────────────────────────────────────────────────────────────────────────

function readLocalizeJson(db: string, lang: string): Record<string, unknown> | null {
  const row = getAppDb().prepare("SELECT json FROM bol_db_localize WHERE db = ? AND lang = ?").get(db, lang) as
    | { json: string }
    | undefined;
  if (row) return JSON.parse(row.json) as Record<string, unknown>;
  const f = path.join(META_DIR, `${db}.${lang}.prop.pretty.json`);
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
}

function writeLocalizeJson(db: string, lang: string, json: unknown): void {
  const raw = JSON.stringify(json);
  const existing = getAppDb().prepare("SELECT id FROM bol_db_localize WHERE db = ? AND lang = ?").get(db, lang) as
    | { id: number }
    | undefined;
  if (!existing) getAppDb().prepare("INSERT INTO bol_db_localize (db, lang, json) VALUES (?, ?, ?)").run(db, lang, raw);
  else getAppDb().prepare("UPDATE bol_db_localize SET json = ? WHERE id = ?").run(raw, existing.id);
}

/** get_grammargroup_list(db) — "info" + grupos del JSON de comentarios. */
export function getGrammargroupList(db: string): string[] {
  const comments = readLocalizeJson(db, "comment");
  const res = ["info"];
  if (!comments) return res;
  for (const [l1, v1] of Object.entries(comments)) {
    if (v1 && typeof v1 === "object") for (const l2 of Object.keys(v1 as Record<string, unknown>)) res.push(`${l1}.${l2}`);
  }
  return res;
}

function recursiveCount(a: unknown): number {
  if (Array.isArray(a) || (a && typeof a === "object")) {
    let n = 0;
    for (const v of Object.values(a as Record<string, unknown>)) n += recursiveCount(v);
    return n;
  }
  return 1;
}

function recursiveCountValueSet(a: unknown): number {
  if (Array.isArray(a) || (a && typeof a === "object")) {
    let n = 0;
    for (const v of Object.values(a as Record<string, unknown>)) n += recursiveCountValueSet(v);
    return n;
  }
  if (a || a === 0) return 1;
  return 0;
}

/** count_grammar_lines(db). */
export function countGrammarLines(db: string): number {
  const comments = readLocalizeJson(db, "comment");
  return comments ? recursiveCount(comments) : 0;
}

/** count_grammar_translated(db, lang). */
export function countGrammarTranslated(db: string, lang: string): number {
  const l = readLocalizeJson(db, lang);
  return l ? recursiveCountValueSet(l) : 0;
}

function flatten(prefix: string, src: Record<string, unknown>, dst: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(src)) {
    const key = prefix === "" ? k : `${prefix}.${k}`;
    if (v && typeof v === "object") flatten(key, v as Record<string, unknown>, dst);
    else dst[key] = v;
  }
}

function unflatten(flat: Record<string, unknown>): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const keys = key.split(".");
    let target = json;
    for (const k of keys.slice(0, -1)) {
      if (typeof target[k] !== "object" || target[k] === null) target[k] = {};
      target = target[k] as Record<string, unknown>;
    }
    target[keys[keys.length - 1]] = value;
  }
  return json;
}

export interface GrammarLine {
  symbolic_name: string;
  symbolic_name_dash: string;
  text_show: string;
  text_edit: string;
  comment: unknown;
}

/** get_grammar_lines_part(lang_edit, lang_show, grammargroup). */
export function getGrammarLinesPart(langEdit: string, langShow: string, db: string, grammargroup: string): GrammarLine[] {
  const commentFlat: Record<string, unknown> = {};
  const showFlat: Record<string, unknown> = {};
  const editFlat: Record<string, unknown> = {};
  const comments = readLocalizeJson(db, "comment");
  const show = readLocalizeJson(db, langShow);
  const edit = readLocalizeJson(db, langEdit);
  if (comments) flatten("", comments, commentFlat);
  if (show) flatten("", show, showFlat);
  if (edit) flatten("", edit, editFlat);

  const res: GrammarLine[] = [];
  const isGroup = (key: string) =>
    grammargroup === "info"
      ? !key.includes(".")
      : key.startsWith(grammargroup) && key[grammargroup.length] === ".";
  for (const [key, comment] of Object.entries(commentFlat)) {
    if (!isGroup(key)) continue;
    res.push({
      symbolic_name: key,
      symbolic_name_dash: key.replace(/\./g, "--"),
      text_show: showFlat[key] !== undefined ? String(showFlat[key]) : "",
      text_edit: editFlat[key] !== undefined ? String(editFlat[key]) : "",
      comment,
    });
  }
  return res;
}

/** get_grammar_untranslated(lang_edit): claves de comentarios sin texto. */
export function getGrammarUntranslated(langEdit: string, db: string): { grammargroup: string; symbolic_name: string }[] {
  const commentFlat: Record<string, unknown> = {};
  const editFlat: Record<string, unknown> = {};
  const comments = readLocalizeJson(db, "comment");
  const edit = readLocalizeJson(db, langEdit);
  if (comments) flatten("", comments, commentFlat);
  if (edit) flatten("", edit, editFlat);
  const res: { grammargroup: string; symbolic_name: string }[] = [];
  for (const [k, v] of Object.entries(commentFlat)) {
    if (editFlat[k] === undefined || editFlat[k] === "") {
      if (!k.includes(".")) res.push({ grammargroup: "info", symbolic_name: k });
      else {
        const m = k.match(/([^.]*\.[^.]*)\.(.*)/);
        if (m) res.push({ grammargroup: m[1], symbolic_name: m[2] });
      }
      void v;
    }
  }
  return res;
}

/** update_grammar_lines(lang_edit, db, post) — guarda el JSON aplanado. */
export function updateGrammarLines(langEdit: string, db: string, post: Record<string, string>, variant: string | null): void {
  const commentFlat: Record<string, unknown> = {};
  const comments = readLocalizeJson(db, "comment");
  if (!comments) throw new Error("No comment data");
  flatten("", comments, commentFlat);

  const editFlat: Record<string, unknown> = {};
  const edit = readLocalizeJson(db, langEdit);
  if (edit) flatten("", edit, editFlat);

  for (const [key, modif] of Object.entries(post)) {
    if (!key.startsWith("modif-") || modif !== "true") continue;
    const key2 = key.slice(6);
    const key3 = key2.replace(/--/g, ".");
    if (commentFlat[key3] === undefined) throw new Error(`Unknown key: ${key3}`);
    const newval = (post[key2] ?? "").trim();
    editFlat[key3] = String(commentFlat[key3]).startsWith("f:num") ? Number(newval) : newval;
  }

  const fullLang = variant ? `${langEdit}_${variant}` : langEdit;
  writeLocalizeJson(db, fullLang, unflatten(editFlat));
}

// ─────────────────────────────────────────────────────────────────────────────
// Administración de idiomas (modify_localization / add_language)
// ─────────────────────────────────────────────────────────────────────────────

const LOC_FLAGS = ["iface", "heblex", "greeklex", "latinlex", "latin2lex"] as const;
type LocType = (typeof LOC_FLAGS)[number];

/** modify_localization(enable, loc_type, lang_abb). */
export function modifyLocalization(enable: boolean, locType: LocType, langAbb: string): void {
  if (!LOC_FLAGS.includes(locType)) throw new Error("malformed_url");
  const flag = `${locType}_enabled`;
  getAppDb().prepare(`UPDATE bol_translation_languages SET ${flag} = ? WHERE abb = ?`).run(enable ? 1 : 0, cleanAbb(langAbb));
}

/** add_language(abbrev, internal, native). */
export function addLanguage(abbrev: string, internal: string, native: string): void {
  const db = getAppDb();
  const existing = db.prepare("SELECT id FROM bol_translation_languages WHERE abb = ?").get(cleanAbb(abbrev)) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE bol_translation_languages SET internal = ?, native = ? WHERE id = ?").run(internal, native, existing.id);
    return;
  }
  db.prepare(
    "INSERT INTO bol_translation_languages (abb, internal, native, iface_enabled, heblex_enabled, greeklex_enabled, latinlex_enabled, latin2lex_enabled) VALUES (?, ?, ?, 1, 0, 0, 0, 0)",
  ).run(cleanAbb(abbrev), internal, native);
}

/** Simplemente para que el lint no se queje de imports de solo aviso. */
export function _unused(): string[] {
  return listLangSrcLangs();
}
