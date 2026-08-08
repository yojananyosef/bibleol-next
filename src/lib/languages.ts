import { getAppDb } from "./db/sqlite.ts";
import { getConfig } from "./config.ts";

/** Idiomas disponibles para preflang ('none' + bol_translation_languages). */
export function getAvailableLanguages(): { code: string; name: string }[] {
  const rows = getAppDb()
    .prepare("SELECT internal AS code, native AS name FROM bol_translation_languages WHERE iface_enabled=1 ORDER BY name")
    .all() as { code: string; name: string }[];
  return [{ code: "none", name: "None" }, ...rows];
}

/** Variantes disponibles ('main' + config.variants). */
export function getAvailableVariants(): string[] {
  return ["main", ...getConfig().variants];
}
