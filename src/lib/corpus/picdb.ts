/**
 * picdb.ts — Réplica de `libraries/Picdb.php` de BibleOL.
 * Lee bible_refs / bible_urls de la BD app (bol_bible_refs / bol_bible_urls).
 */

import type Database from "better-sqlite3";

export class Picdb {
  constructor(private db: Database.Database) {}

  /** [booknumber, chapter, verse, pic1, pic2…] o null. */
  get_pics(bcv: (string | number)[]): (number | string)[] | null {
    const rows = this.db
      .prepare("SELECT booknumber,picture FROM bible_refs WHERE book=? AND chapter=? AND verse=?")
      .all(bcv[0], bcv[1], bcv[2]) as { booknumber: unknown; picture: unknown }[];
    if (rows.length === 0) return null;
    const res: (number | string)[] = [parseInt(String(rows[0].booknumber), 10), bcv[1], bcv[2]];
    for (const row of rows) res.push(parseInt(String(row.picture), 10));
    return res;
  }

  /** [{ url, type }…] o null. */
  get_urls(bcv: (string | number)[]): { url: string; type: string }[] | null {
    const rows = this.db
      .prepare("SELECT url,type FROM bible_urls WHERE book=? AND chapter=? AND verse=?")
      .all(bcv[0], bcv[1], bcv[2]) as { url: string; type: string }[];
    if (rows.length === 0) return null;
    return rows.map((r) => ({ url: r.url, type: r.type }));
  }
}
