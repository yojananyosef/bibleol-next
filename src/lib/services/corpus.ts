/**
 * services/corpus.ts — Equivalente de Mod_askemdros::show_text / db_and_books
 * para la UI. Envuelve la capa corpus (emdros.ts + dictionary.ts) con el
 * idioma de la sesión del usuario.
 */

import { getEmdros, findMonads, dbAndBooks, shebanqLink, type DbBooks } from "@/lib/corpus/emdros";
import { Dictionary, type MonadObjectJSON } from "@/lib/corpus/dictionary";
import type { ReaderL10n, ReaderSentenceGrammar } from "@/lib/reader/sentencegrammar";
import { Picdb } from "@/lib/corpus/picdb";
import { getAppDb } from "@/lib/db/sqlite";

/** Error de texto localizado (mensaje = clave de idioma). */
export class TextError extends Error {}

export interface ShowTextResult {
  db: string;
  bookTitle: string | number | null;
  dictionary: { bookTitle: string | number | null; sentenceSets: string[]; sentenceSetsQuiz: string[] | null; monadObjects: { level: number; objects: MonadObjectJSON[] }[] };
  dbinfo_json: string;
  l10n_json: string;
  typeinfo_json: string;
  shebanq_link: string | null;
  /** Dbinfo/l10n/typeinfo parseados para la UI (sentencegrammar, settings). */
  reader: {
    sentencegrammar: ReaderSentenceGrammar[];
    objectSettings: Record<string, { featuresetting?: Record<string, { foreignText?: boolean; transliteratedText?: boolean }> }>;
    objHasSurface: string;
    surfaceFeature: string;
    l10n: ReaderL10n;
    typeinfo: { obj2feat: Record<string, Record<string, string>> };
  };
}

/**
 * show_text(): pasaje + Dictionary completo (gloss, jerarquía, bcv).
 * Lanza TextError('no_text_found') si el pasaje no existe.
 */
export function showText(
  db: string,
  book: string,
  chapter: number,
  vfrom: number,
  vto: number,
  language: string,
  showIcons: boolean,
): ShowTextResult {
  const handle = getEmdros(db);
  handle.dbconfig.initConfig(db, db, language);

  let passage;
  try {
    passage = findMonads(handle, book, chapter, vfrom, vto);
  } catch {
    throw new TextError("no_text_found");
  }

  const dict = new Dictionary(
    { msets: [passage], inQuiz: false, showIcons },
    {
      mql: handle.mql,
      dbinfo: JSON.parse(handle.dbconfig.dbinfo_json),
      l10nJson: handle.dbconfig.l10n_json,
      picdb: new Picdb(getAppDb()),
    },
  );

  const dbinfoParsed = JSON.parse(handle.dbconfig.dbinfo_json) as {
    sentencegrammar: ReaderSentenceGrammar[];
    objectSettings: Record<string, { featuresetting?: Record<string, { foreignText?: boolean; transliteratedText?: boolean }> }>;
    objHasSurface: string;
    surfaceFeature: string;
  };
  const typeinfoParsed = JSON.parse(handle.dbconfig.typeinfo_json) as { obj2feat: Record<string, Record<string, string>> };
  const l10nParsed = JSON.parse(handle.dbconfig.l10n_json) as ReaderL10n;

  return {
    db,
    bookTitle: dict.get_book_title(),
    dictionary: dict.toJSON(),
    dbinfo_json: handle.dbconfig.dbinfo_json,
    l10n_json: handle.dbconfig.l10n_json,
    typeinfo_json: handle.dbconfig.typeinfo_json,
    shebanq_link: shebanqLink(db, book, chapter),
    reader: {
      sentencegrammar: dbinfoParsed.sentencegrammar,
      objectSettings: dbinfoParsed.objectSettings,
      objHasSurface: dbinfoParsed.objHasSurface,
      surfaceFeature: dbinfoParsed.surfaceFeature,
      l10n: l10nParsed,
      typeinfo: typeinfoParsed,
    },
  };
}

/** db_and_books(): corpora disponibles con libros localizados. */
export function getDbAndBooks(language: string): DbBooks[] {
  return dbAndBooks(language);
}
