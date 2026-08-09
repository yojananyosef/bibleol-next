/**
 * reader/charset.ts — Port de `BibleOL/ts/charset.ts`.
 *
 * Características del set de caracteres del texto (dirección, clases CSS
 * para el idioma extranjero y su transliteración).
 */

export interface Charset {
  isHebrew: boolean;
  isRtl: boolean;
  /** Clase CSS del idioma principal del texto (hebrew/greek/latin/…). */
  foreignClass: string;
  /** Clase CSS de una transliteración del idioma principal. */
  transliteratedClass?: string;
  keyboardName?: string;
}

export function makeCharset(cs: string): Charset {
  switch (cs) {
    case "hebrew":
      return {
        foreignClass: "hebrew",
        transliteratedClass: "hebrew_translit",
        isHebrew: true,
        isRtl: true,
        keyboardName: "IL",
      };
    case "transliterated_hebrew":
      return {
        foreignClass: "hebrew_translit",
        transliteratedClass: "hebrew",
        isHebrew: true,
        isRtl: false,
        keyboardName: "TRHE",
      };
    case "greek":
      return { foreignClass: "greek", transliteratedClass: "ltr", isHebrew: false, isRtl: false, keyboardName: "GR" };
    case "latin":
      return { foreignClass: "latin", transliteratedClass: "ltr", isHebrew: false, isRtl: false };
    default:
      return { foreignClass: "ltr", transliteratedClass: "ltr", isHebrew: false, isRtl: false };
  }
}
