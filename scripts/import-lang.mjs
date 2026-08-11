/**
 * import-lang.mjs — Import del langsrc (language/langsrc) a la BD:
 *   - bol_language_comment  (claves canónicas desde comment/*_lang.php)
 *   - bol_language_{abb}    (traducciones por idioma desde {abb}/*_lang.php)
 * Idempotente: solo inserta claves que falten. Uso: `npm run i18n:import`.
 */

import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const LANG_ROOT = path.join(root, "language", "langsrc");
if (!existsSync(LANG_ROOT)) {
  console.error("No language/langsrc — copia el langsrc del legacy (git clone) o ejecuta corpus:download");
  process.exit(1);
}

const { getAppDb } = await import("../src/lib/db/sqlite.ts");
const translate = await import("../src/lib/services/translate.ts");
const { listLangSrcLangs } = await import("../src/lib/i18n/loader.ts");

const db = getAppDb();
translate.importCommentFromSrc();
console.log(`bol_language_comment: ${translate.countIfLines(null)} claves ${translate.getTextgroupList().length} grupos`);

for (const abb of listLangSrcLangs()) {
  translate.importLangFromSrc(abb);
  console.log(`bol_language_${abb}: ${translate.countIfTranslated(abb)} claves`);
}
db.close();
