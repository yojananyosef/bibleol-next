/**
 * l10n.ts — Localización de la UI para páginas/componentes.
 * Mod_localize::get_json() del legacy devuelve el diccionario 'js' como JSON
 * para el cliente; aquí exponemos el helper de línea y el JSON embebible.
 */

import { loadLangDictionary, langText } from "./loader.ts";

/** Traducción de una clave con el idioma dado (fallback en → clave). */
export function t(lang: string, key: string): string {
  return langText(lang, key);
}

/**
 * l10n_json para el cliente: diccionario completo 'js' + 'common' + 'menu' +
 * 'login' etc. como JSON plano para embed (equivalente a Mod_localize).
 */
export function getL10nJson(lang: string): string {
  const dict = loadLangDictionary(lang);
  const flat: Record<string, string> = {};
  for (const gd of Object.values(dict)) Object.assign(flat, gd);
  return JSON.stringify(flat);
}

/** Como getL10nJson pero devuelve objeto (para props de server components). */
export function getL10nObject(lang: string): Record<string, string> {
  const dict = loadLangDictionary(lang);
  const flat: Record<string, string> = {};
  for (const gd of Object.values(dict)) Object.assign(flat, gd);
  return flat;
}
