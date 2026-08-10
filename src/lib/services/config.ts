/**
 * services/config.ts — Equivalente de Mod_config (alfabetos, fuentes, personal_font).
 * Port 1:1: font_setting con fallback a user_id=0, avail_fonts estática,
 * get_radio_button_value, set_font y font_selection (Mod_askemdros::$font_selection).
 */

import { getAppDb } from "../db/sqlite.ts";

export interface Alphabet {
  id: number;
  name: string;
  direction: "rtl" | "ltr";
  sample: string;
  english: string;
}

/** Fila de bol_font + join bol_alphabet (como Mod_config::font_setting). */
export interface FontSetting {
  id: number;
  user_id: number;
  alphabet_id: number;
  font_family: string;
  text_size: number;
  text_italic: number;
  text_bold: number;
  feature_size: number;
  feature_italic: number;
  feature_bold: number;
  tooltip_size: number;
  tooltip_italic: number;
  tooltip_bold: number;
  input_size: number;
  input_italic: number;
  input_bold: number;
  name: string;
  direction: string;
  sample: string;
  english: string;
}

/** Mod_config::alphabets — id → name, en orden de id. */
export function alphabets(): Alphabet[] {
  const db = getAppDb();
  return db.prepare("SELECT id, name, direction, sample, english FROM bol_alphabet ORDER BY id").all() as Alphabet[];
}

/** Mod_config::font_setting — preferencia del usuario con fallback a user_id=0. */
export function fontSetting(alphabet: string, userId: number): FontSetting {
  const db = getAppDb();
  const sql = `
    SELECT f.*, a.name, a.direction, a.sample, a.english
    FROM bol_alphabet a JOIN bol_font f ON f.alphabet_id = a.id
    WHERE a.name = ? AND f.user_id = ?
  `;
  const row = (db.prepare(sql).get(alphabet, userId) ??
    db.prepare(sql).get(alphabet, 0)) as FontSetting | undefined;
  if (!row) throw new Error(`font_setting: no hay configuración para el alfabeto '${alphabet}'`);
  return row;
}

/** Mod_config::avail_fonts — lista estática [nombre, es_webfont]. */
export function availFonts(alphabet: string): [string, boolean][] {
  switch (alphabet) {
    case "hebrew":
      return [
        ["Ezra SIL Webfont", true],
        ["Frank Ruehl CLM Webfont", true],
        ["David CLM Webfont", true],
        ["Times New Roman", false],
        ["Arial", false],
      ];
    case "hebrew_translit":
      return [
        ["Doulos SIL Webfont", true],
        ["Segoe UI", false],
        ["Times New Roman", false],
        ["Arial", false],
      ];
    case "greek":
      return [
        ["Galatia SIL Webfont", true],
        ["Gentium Plus Webfont", true],
        ["Segoe UI", false],
        ["Times New Roman", false],
        ["Arial", false],
      ];
    case "latin":
      return [
        ["Titillium", true],
        ["Times New Roman", false],
        ["Arial", false],
      ];
    default:
      return [];
  }
}

/** Mod_config::personal_font — fuente personal del usuario ('' si no tiene). */
export function personalFont(alphabet: string, userId: number): string {
  const db = getAppDb();
  const row = db
    .prepare(
      `SELECT pf.font_family FROM bol_alphabet a JOIN bol_personal_font pf ON pf.alphabet_id = a.id
       WHERE a.name = ? AND pf.user_id = ?`,
    )
    .get(alphabet, userId) as { font_family: string } | undefined;
  return row?.font_family ?? "";
}

/** Mod_config::get_radio_button_value — índice en avail_fonts, 'mine' o 'none'. */
export function getRadioButtonValue(chosen: string, avail: [string, boolean][], mine: string): string {
  for (let ix = 0; ix < avail.length; ++ix) if (avail[ix][0] === chosen) return String(ix);
  if (mine === chosen) return "mine";
  return "none";
}

type FontFormData = Record<string, FormDataEntryValue | null>;

function isSetOn(p: FormDataEntryValue | null): boolean {
  return p !== null && p === "on";
}

/** Mod_config::set_font — guarda preferencias de los 4 alfabetos del formulario. */
export function setFont(userId: number, post: FontFormData): void {
  const db = getAppDb();
  const alphas = alphabets();
  for (const a of alphas) {
    const alph = a.name;
    let fontFamily: string;
    const choice = post[`${alph}choice`];

    let usePersonalFont = false;
    if (typeof choice === "string") {
      const fontIx = choice.split("_").pop() ?? "";
      if (fontIx === "mine") {
        const myfont = post[`${alph}_myfont`];
        fontFamily = typeof myfont === "string" ? myfont : "";
        usePersonalFont = true;
      } else if (fontIx !== "none") {
        const avail = availFonts(alph)[Number(fontIx)];
        fontFamily = avail ? avail[0] : fontSetting(alph, userId).font_family;
      } else {
        fontFamily = fontSetting(alph, userId).font_family;
      }
    } else {
      fontFamily = fontSetting(alph, userId).font_family;
    }

    const style = (s: string) => ({
      size: Number(post[`${alph}${s}size`] ?? 0),
      italic: isSetOn(post[`${alph}${s}italic`]) ? 1 : 0,
      bold: isSetOn(post[`${alph}${s}bold`]) ? 1 : 0,
    });
    const text = style("text");
    const feature = style("feature");
    const tooltip = style("tooltip");
    const input = style("input");

    const existing = db
      .prepare("SELECT id FROM bol_font WHERE alphabet_id = ? AND user_id = ?")
      .get(a.id, userId) as { id: number } | undefined;

    if (!existing) {
      db.prepare(
        `INSERT INTO bol_font (user_id, alphabet_id, font_family,
           text_size, text_italic, text_bold,
           feature_size, feature_italic, feature_bold,
           tooltip_size, tooltip_italic, tooltip_bold,
           input_size, input_italic, input_bold)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        userId, a.id, fontFamily,
        text.size, text.italic, text.bold,
        feature.size, feature.italic, feature.bold,
        tooltip.size, tooltip.italic, tooltip.bold,
        input.size, input.italic, input.bold,
      );
    } else {
      db.prepare(
        `UPDATE bol_font SET font_family = ?,
           text_size = ?, text_italic = ?, text_bold = ?,
           feature_size = ?, feature_italic = ?, feature_bold = ?,
           tooltip_size = ?, tooltip_italic = ?, tooltip_bold = ?,
           input_size = ?, input_italic = ?, input_bold = ?
         WHERE id = ?`,
      ).run(
        fontFamily,
        text.size, text.italic, text.bold,
        feature.size, feature.italic, feature.bold,
        tooltip.size, tooltip.italic, tooltip.bold,
        input.size, input.italic, input.bold,
        existing.id,
      );
    }

    if (usePersonalFont) {
      const personal = db
        .prepare("SELECT id FROM bol_personal_font WHERE alphabet_id = ? AND user_id = ?")
        .get(a.id, userId) as { id: number } | undefined;
      if (!personal) {
        db.prepare("INSERT INTO bol_personal_font (user_id, alphabet_id, font_family) VALUES (?, ?, ?)").run(
          userId, a.id, fontFamily,
        );
      } else {
        db.prepare("UPDATE bol_personal_font SET font_family = ? WHERE id = ?").run(fontFamily, personal.id);
      }
    }
  }
}

/**
 * Mod_askemdros::$font_selection — fuentes del usuario (o las de user_id=0).
 * Filas con el join de bol_alphabet listas para view_font_css.
 */
export function fontSelection(userId: number): FontSetting[] {
  const db = getAppDb();
  const sql = `
    SELECT f.*, a.name, a.direction, a.sample, a.english
    FROM bol_alphabet a JOIN bol_font f ON f.alphabet_id = a.id
    WHERE f.user_id = ? ORDER BY a.id
  `;
  const rows = (userId > 0 ? (db.prepare(sql).all(userId) as FontSetting[]) : []) ;
  if (rows.length === 0) return db.prepare(sql.replace("f.user_id = ?", "f.user_id = 0")).all() as FontSetting[];
  return rows;
}
