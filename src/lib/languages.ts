import { getAppDb } from "./db/sqlite.ts";
import { getConfig } from "./config.ts";
import { langText } from "./i18n/loader.ts";

/** Idiomas disponibles para preflang ('none' + bol_translation_languages).
 *  El código es `abb` (como el select de `view_edit_user.php`); la etiqueta es
 *  `lang->line(internal)` del legacy, traducida al idioma de la interfaz. */
export function getAvailableLanguages(lang: string): { code: string; name: string }[] {
  const rows = getAppDb()
    .prepare("SELECT abb AS code, internal FROM bol_translation_languages WHERE iface_enabled=1 ORDER BY id")
    .all() as { code: string; internal: string }[];
  return [{ code: "none", name: langText(lang, "no_language") }, ...rows.map((r) => ({ code: r.code, name: langText(lang, r.internal) }))];
}

/** Normaliza un código de idioma a su `abb` (los preflang legacy podían guardar `internal`). */
export function normalizeLang(lang: string): string {
  if (!lang || lang === "none") return "en";
  const row = getAppDb()
    .prepare("SELECT abb FROM bol_translation_languages WHERE abb = ? OR internal = ?")
    .get(lang, lang) as { abb: string } | undefined;
  return row?.abb ?? lang;
}

/** Variantes disponibles ('main' + config.variants). */
export function getAvailableVariants(): string[] {
  return ["main", ...getConfig().variants];
}
