import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TMP = mkdtempSync(path.join(tmpdir(), "bibleol-pic2db-"));
process.env.BIBLEOL_DATA_DIR = TMP;
process.env.BIBLEOL_SESSION_SECRET = "pic2db-test-secret";

const REFS_SAMPLE: Record<string, number[]> = {
  "Genesis:1:1": [12, 13, 13],
  "Genesis:1:2": [14],
  "Psalmi:23:1": [99],
};

const URLS_SAMPLE: Record<string, [string, string][]> = {
  "Genesis:1:1": [
    ["https://example.com/a", "u"],
    ["https://example.com/b", "v"],
  ],
  "Esra:2:3": [["https://example.com/c", "d"]],
};

let db: import("better-sqlite3").Database;
let pic2db: typeof import("../src/lib/services/pic2db.ts");

before(async () => {
  const [{ getAppDb }, mod] = await Promise.all([
    import("../src/lib/db/sqlite.ts"),
    import("../src/lib/services/pic2db.ts"),
  ]);
  db = getAppDb();
  pic2db = mod;
});

after(() => {
  db.close();
});

test("buildRefsBatch: booknumber por book_number_from_picdb + array_unique 1:1", () => {
  const batch = pic2db.buildRefsBatch(REFS_SAMPLE);
  assert.equal(batch.length, 4);
  assert.deepEqual(
    batch.filter((r) => r.book === "Genesis"),
    [
      { book: "Genesis", booknumber: 1, chapter: 1, verse: 1, picture: 12 },
      { book: "Genesis", booknumber: 1, chapter: 1, verse: 1, picture: 13 },
      { book: "Genesis", booknumber: 1, chapter: 1, verse: 2, picture: 14 },
    ],
  );
  const psalm = batch.find((r) => r.book === "Psalmi");
  assert.deepEqual(psalm, { book: "Psalmi", booknumber: 19, chapter: 23, verse: 1, picture: 99 });
  const unknown = pic2db.buildRefsBatch({ "Unknown:1:1": [5] });
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].booknumber, null);
});

test("buildUrlsBatch: pares [url, type] 1:1", () => {
  const batch = pic2db.buildUrlsBatch(URLS_SAMPLE);
  assert.equal(batch.length, 3);
  assert.deepEqual(batch[0], {
    book: "Genesis",
    booknumber: 1,
    chapter: 1,
    verse: 1,
    url: "https://example.com/a",
    type: "u",
  });
  assert.deepEqual(batch[2], {
    book: "Esra",
    booknumber: 15,
    chapter: 2,
    verse: 3,
    url: "https://example.com/c",
    type: "d",
  });
});

test("rebuildPicTables: dropea y recrea bol_bible_refs/bol_bible_urls e inserta batches", () => {
  pic2db.rebuildPicTables(db, REFS_SAMPLE, URLS_SAMPLE);
  const refs = db
    .prepare("SELECT book, booknumber, chapter, verse, picture FROM bol_bible_refs ORDER BY id")
    .all();
  assert.equal(refs.length, 4);
  assert.deepEqual(refs[1], { book: "Genesis", booknumber: 1, chapter: 1, verse: 1, picture: 13 });
  const urls = db.prepare("SELECT url, type FROM bol_bible_urls WHERE book='Genesis'").all();
  assert.equal(urls.length, 2);
  pic2db.rebuildPicTables(db, { "Genesis:1:1": [7] }, {});
  const refs2 = db
    .prepare("SELECT book, chapter, verse, picture FROM bol_bible_refs")
    .all();
  assert.deepEqual(refs2, [{ book: "Genesis", chapter: 1, verse: 1, picture: 7 }]);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM bol_bible_urls").get() as { n: number }).n, 0);
});