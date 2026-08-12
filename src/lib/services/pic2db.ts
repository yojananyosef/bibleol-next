import type Database from "better-sqlite3";

export const bookNumberFromPicdb: Record<string, number> = {
  Genesis: 1,
  Exodus: 2,
  Leviticus: 3,
  Numeri: 4,
  Deuteronomium: 5,
  Josua: 6,
  Judices: 7,
  Ruth: 8,
  Samuel_I: 9,
  Samuel_II: 10,
  Reges_I: 11,
  Reges_II: 12,
  Chronica_I: 13,
  Chronica_II: 14,
  Esra: 15,
  Nehemia: 16,
  Esther: 17,
  Iob: 18,
  Psalmi: 19,
  Proverbia: 20,
  Ecclesiastes: 21,
  Canticum: 22,
  Jesaia: 23,
  Jeremia: 24,
  Threni: 25,
  Ezechiel: 26,
  Daniel: 27,
  Hosea: 28,
  Joel: 29,
  Amos: 30,
  Obadia: 31,
  Jona: 32,
  Micha: 33,
  Nahum: 34,
  Habakuk: 35,
  Zephania: 36,
  Haggai: 37,
  Sacharia: 38,
  Maleachi: 39,
};

export interface RefRow {
  book: string;
  booknumber: number | null;
  chapter: number;
  verse: number;
  picture: number;
}

export interface UrlRow {
  book: string;
  booknumber: number | null;
  chapter: number;
  verse: number;
  url: string;
  type: string;
}

export function buildRefsBatch(biblerefs: Record<string, number[]>): RefRow[] {
  const batch: RefRow[] = [];
  for (const src of Object.keys(biblerefs)) {
    const [book, chapter, verse] = src.split(":");
    for (const picture of [...new Set(biblerefs[src])]) {
      batch.push({
        book,
        booknumber: bookNumberFromPicdb[book] ?? null,
        chapter: parseInt(chapter, 10),
        verse: parseInt(verse, 10),
        picture,
      });
    }
  }
  return batch;
}

export function buildUrlsBatch(bibleurls: Record<string, [string, string][]>): UrlRow[] {
  const batch: UrlRow[] = [];
  for (const src of Object.keys(bibleurls)) {
    const [book, chapter, verse] = src.split(":");
    for (const urltype of bibleurls[src]) {
      batch.push({
        book,
        booknumber: bookNumberFromPicdb[book] ?? null,
        chapter: parseInt(chapter, 10),
        verse: parseInt(verse, 10),
        url: urltype[0],
        type: urltype[1],
      });
    }
  }
  return batch;
}

export function rebuildPicTables(
  db: Database.Database,
  biblerefs: Record<string, number[]>,
  bibleurls: Record<string, [string, string][]>,
): void {
  db.exec(`
    DROP TABLE IF EXISTS bol_bible_refs;
    CREATE TABLE bol_bible_refs (
      id INTEGER NOT NULL, book TEXT NOT NULL, booknumber INTEGER NOT NULL,
      chapter INTEGER NOT NULL, verse INTEGER NOT NULL, picture INTEGER NOT NULL,
      PRIMARY KEY (id)
    );
    DROP TABLE IF EXISTS bol_bible_urls;
    CREATE TABLE bol_bible_urls (
      id INTEGER NOT NULL, book TEXT NOT NULL, booknumber INTEGER NOT NULL,
      chapter INTEGER NOT NULL, verse INTEGER NOT NULL, url TEXT NOT NULL,
      type char(1) NOT NULL, PRIMARY KEY (id)
    );
  `);
  const refs = buildRefsBatch(biblerefs);
  if (refs.length > 0) {
    const insert = db.prepare(
      "INSERT INTO bol_bible_refs (book, booknumber, chapter, verse, picture) VALUES (?, ?, ?, ?, ?)",
    );
    db.transaction(() => {
      for (const r of refs) insert.run(r.book, r.booknumber, r.chapter, r.verse, r.picture);
    })();
  }
  const urls = buildUrlsBatch(bibleurls);
  if (urls.length > 0) {
    const insert = db.prepare(
      "INSERT INTO bol_bible_urls (book, booknumber, chapter, verse, url, type) VALUES (?, ?, ?, ?, ?, ?)",
    );
    db.transaction(() => {
      for (const u of urls) insert.run(u.book, u.booknumber, u.chapter, u.verse, u.url, u.type);
    })();
  }
}
