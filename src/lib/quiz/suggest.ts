/**
 * quiz/suggest.ts — Réplica 1:1 de `libraries/Suggest_answers.php`.
 *
 * findSuggestions(): colección de valores para preguntas de opción múltiple.
 * El valor correcto está garantizado entre los sugeridos. Las bases SQLite
 * (legacy: `db/<database>`) se abren una vez y se cachean por nombre.
 */

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../db/sqlite.ts";

const databaseHandles = new Map<string, Database.Database>();

/** sprintf PHP (solo %s y %1$s…) con escape SQL del argumento. */
function sprintf(sql: string, ...args: string[]): string {
  let i = 0;
  return sql.replace(/%(\d*)\$?s/g, (_m, pos: string) => {
    const idx = pos === "" ? i++ : parseInt(pos, 10) - 1;
    const arg = args[idx] ?? "";
    // Igual que PHP: la interpolación es cruda; las comillas se duplican
    // para no romper el SQL (CodeIgniter escape() hacía lo mismo).
    return arg.replace(/'/g, "''");
  });
}

function getDb(database: string): Database.Database {
  const cached = databaseHandles.get(database);
  if (cached) return cached;
  const candidates = [
    path.join(DATA_DIR, "hints", database),
    path.join(DATA_DIR, database),
    path.join(DATA_DIR, "quizzes", database),
  ];
  const file = candidates.find((p) => existsSync(p)) ?? candidates[0];
  // PHP (sqlite3 driver) creaba el archivo si no existía; mismo comportamiento.
  const db = new Database(file);
  databaseHandles.set(database, db);
  return db;
}

/**
 * Retrieves a collection of values to suggest as part of a multiple choice
 * question. The correct value is guaranteed to be among the values suggested.
 * @param sqlCommand The SQL command (from `<alternateshowrequest>` of a .dbxml).
 * @param param1 A parameter to substitute in `sqlCommand` (htmlspecialchars-decoded).
 * @param correct The correct value for the feature.
 * @param lowerLimit If the number of possible answers is less than this, returns null.
 * @param upperLimit If the number of possible answers is greater than this, returns
 * a random subset of the legal values; the correct answer is guaranteed among them.
 * @returns An array of suggested values, or null.
 */
export function findSuggestions(
  database: string,
  sqlCommand: string,
  param1: string,
  correct: string,
  lowerLimit: number,
  upperLimit: number,
): string[] | null {
  if (correct === "") correct = "-";

  // The features have been HTML encoded, we need to undo that
  const decoded = htmlSpecialCharsDecode(param1);

  const query = getDb(database).prepare(sprintf(sqlCommand, decoded));

  const results: string[] = [];
  for (const row of query.all() as Record<string, unknown>[]) {
    const first = Object.values(row)[0];
    results.push(first === null || first === undefined || first === "" ? "-" : String(first));
  }

  if (results.length < lowerLimit) return null;

  while (results.length > upperLimit) {
    // El correcto nunca se elimina: elige un índice aleatorio entre los demás.
    const candidates = results
      .map((v, ix) => ({ v, ix }))
      .filter(({ v }) => v !== correct);
    if (candidates.length === 0) break;
    const { ix } = candidates[Math.floor(Math.random() * candidates.length)];
    results.splice(ix, 1);
  }

  return results;
}

/** htmlspecialchars_decode() de PHP (ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML401). */
function htmlSpecialCharsDecode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(parseInt(n, 10)));
}