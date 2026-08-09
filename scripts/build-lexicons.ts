/**
 * build-lexicons.ts — Construye data/lexicons.db desde los CSVs de
 * data/lexicons/ (dumps de download_lex del legacy BibleOL).
 *
 * Espeja las tablas MySQL del legacy (prefijo bol_):
 *   lexicon_Hebrew / lexicon_Aramaic: (id, lex, vs, tally,
 *     vocalized_lexeme_utf8, roman, sortorder, ...)
 *   lexicon_greek: (id, strongs, strongs_unreliable, lemma, tally, ...)
 *   lexicon_latin: (id, lemma, part_of_speech, tally, ...)
 *   lexicon_<Src>_<dst>: (lex_id, gloss)   — una tabla por idioma
 *
 * Los ids del maestro se asignan en el orden del dump (sortorder, lex, vs);
 * todos los CSVs de idiomas comparten ese orden, así que las referencias
 * lex_id coinciden entre idiomas.
 *
 * Uso: bun run scripts/build-lexicons.ts
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DATA_DIR } from "../src/lib/db/sqlite.ts";

const SRC_DIR = path.join(DATA_DIR, "lexicons");
const OUT = path.join(DATA_DIR, "lexicons.db");

/** Columnas de verbal stem por fuente (nombre en CSV → valor verbal_stem_t). */
const STEM_COLS: Record<string, [string, string][]> = {
  heb: [
    ["None", "NA"], ["Qal", "qal"], ["Nifal", "nif"], ["Piel", "piel"], ["Pual", "pual"],
    ["Hitpael", "hit"], ["Hifil", "hif"], ["Hofal", "hof"], ["Hishtafal", "hsht"],
    ["Passive Qal", "pasq"], ["Etpaal", "etpa"], ["Nitpael", "nit"], ["Hotpaal", "hotp"],
    ["Tifal", "tif"], ["Hitpoal", "htpo"], ["Poal", "poal"], ["Poel", "poel"],
  ],
  aram: [
    ["None", "NA"], ["Peal", "peal"], ["Peil", "peil"], ["Pael", "pael"], ["Hafel", "haf"],
    ["Afel", "afel"], ["Shafel", "shaf"], ["Hofal", "hof"], ["Hitpeel", "htpe"],
    ["Hitpaal", "htpa"], ["Hishtafal", "hsht"], ["Etpeel", "etpe"], ["Etpaal", "etpa"],
  ],
};

/** Parseo de CSV simple (comillas dobles, comas internas, BOM inicial). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  const fields: string[] = [];
  const push = () => {
    fields.push(cur.replace(/^"|"$/g, ""));
    cur = "";
  };
  for (const ch of text.replace(/^\uFEFF/, "")) {
    if (ch === '"') {
      if (inQuotes && cur.endsWith('""')) cur = cur.slice(0, -1);
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      push();
    } else if (ch === "\n" && !inQuotes) {
      push();
      rows.push(fields.splice(0));
    } else {
      cur += ch;
    }
  }
  if (cur !== "" || fields.length > 0) {
    push();
    rows.push(fields);
  }
  return rows.filter((r) => r.length > 0);
}

interface SourceSpec {
  /** Nombre de la tabla maestra (Hebrew/Aramaic/greek/latin). */
  table: string;
  /** Idiomas destino disponibles (CSV <src>_<lang>.csv). */
  langs: string[];
}

const SOURCES: Record<string, SourceSpec> = {
  heb: { table: "Hebrew", langs: ["da", "en", "de", "nl", "pt", "es", "am", "sw"] },
  aram: { table: "Aramaic", langs: ["da", "en", "de", "es", "nl", "sw"] },
  greek: { table: "greek", langs: ["da", "en", "es", "nl", "pt", "am", "sw"] },
  latin: { table: "latin", langs: ["da", "en"] },
};

interface MasterRow {
  /** clave de negocio para el join del gloss (según fuente) */
  key: string;
  values: (string | number)[];
}

const db = new Database(OUT);
db.pragma("journal_mode = WAL");

// Tabla del legacy bol_heb_urls (se deja vacía, como en la BD actual)
db.exec(`DROP TABLE IF EXISTS heb_urls; CREATE TABLE heb_urls (lex TEXT, language TEXT, url TEXT, icon TEXT)`);

const buildSource = db.transaction((src: string, spec: SourceSpec) => {
  const enCsv = parseCsv(readFileSync(path.join(SRC_DIR, `${src}_en.csv`), "utf8"));
  const header = enCsv[0];
  const col = (hdr: string[], name: string) => hdr.indexOf(name);

  // Fila maestra: los CSVs de heb/aram tienen una fila por (lex, vs);
  // greek/latin una fila por entrada.
  const master: MasterRow[] = [];
  const masterKeyOf: Map<string, number> = new Map(); // key → id maestro

  const stems = STEM_COLS[src] ?? [];

  for (const row of enCsv.slice(1)) {
    const f = (i: number) => row[i] ?? "";
    let key: string;
    if (src === "heb" || src === "aram") {
      const lex = f(col(header, "lex"));
      let vs = "NA";
      for (const [csvCol, stemVal] of stems) {
        if (f(col(header, csvCol)) !== "") {
          vs = stemVal;
          break;
        }
      }
      key = `${lex}\u0000${vs}`;
      master.push({
        key,
        values: [
          lex, vs, parseInt(f(col(header, "Occurrences")), 10) || 0,
          f(col(header, "Lexeme")), f(col(header, "Transliterated")),
        ],
      });
    } else if (src === "greek") {
      key = f(col(header, "Strong's number"));
      master.push({
        key,
        values: [
          parseInt(key, 10) || 0,
          f(col(header, "Strong's unreliable?")) === "yes" ? 1 : 0,
          f(col(header, "Lexeme")),
          parseInt(f(col(header, "Occurrences")), 10) || 0,
        ],
      });
    } else {
      key = `${f(col(header, "Lexeme"))}\u0000${f(col(header, "Part of speech"))}`;
      master.push({
        key,
        values: [f(col(header, "Lexeme")), f(col(header, "Part of speech")), parseInt(f(col(header, "Occurrences")), 10) || 0],
      });
    }
  }

  db.exec(`DROP TABLE IF EXISTS lexicon_${spec.table}`);
  let insMaster: Database.Statement;
  if (src === "heb" || src === "aram") {
    db.exec(`CREATE TABLE lexicon_${spec.table} (id INTEGER PRIMARY KEY, lex TEXT, vs TEXT, tally INTEGER, vocalized_lexeme_utf8 TEXT, roman TEXT, sortorder INTEGER)`);
    insMaster = db.prepare(`INSERT INTO lexicon_${spec.table} (id, lex, vs, tally, vocalized_lexeme_utf8, roman, sortorder) VALUES (?,?,?,?,?,?,?)`);
  } else if (src === "greek") {
    db.exec(`CREATE TABLE lexicon_${spec.table} (id INTEGER PRIMARY KEY, strongs INTEGER, strongs_unreliable INTEGER, lemma TEXT, tally INTEGER, sortorder INTEGER)`);
    insMaster = db.prepare(`INSERT INTO lexicon_${spec.table} (id, strongs, strongs_unreliable, lemma, tally, sortorder) VALUES (?,?,?,?,?,?)`);
  } else {
    db.exec(`CREATE TABLE lexicon_${spec.table} (id INTEGER PRIMARY KEY, lemma TEXT, part_of_speech TEXT, tally INTEGER, sortorder INTEGER)`);
    insMaster = db.prepare(`INSERT INTO lexicon_${spec.table} (id, lemma, part_of_speech, tally, sortorder) VALUES (?,?,?,?,?)`);
  }

  master.forEach((m, i) => {
    masterKeyOf.set(m.key, i + 1);
    insMaster.run(i + 1, ...m.values, i);
  });

  // Tablas de gloss por idioma: mismas filas (mismo orden) que el maestro
  for (const lang of spec.langs) {
    const file = path.join(SRC_DIR, `${src}_${lang}.csv`);
    if (!fileExists(file)) continue;
    const rows = parseCsv(readFileSync(file, "utf8"));
    const hdr = rows[0];
    const glossTable = `lexicon_${spec.table}_${lang}`;
    db.exec(`DROP TABLE IF EXISTS ${glossTable}; CREATE TABLE ${glossTable} (lex_id INTEGER, gloss TEXT)`);
    const ins = db.prepare(`INSERT INTO ${glossTable} (lex_id, gloss) VALUES (?,?)`);

    let any = 0;
    for (let i = 0; i < rows.length - 1; ++i) {
      const row = rows[i + 1];
      const f = (n: number) => row[n] ?? "";
      let gloss = "";
      if (src === "heb" || src === "aram") {
        for (const [csvCol] of stems) {
          const g = f(col(hdr, csvCol));
          if (g !== "") {
            gloss = g;
            break;
          }
        }
      } else {
        gloss = f(col(hdr, "Gloss"));
      }
      if (gloss === "") continue;
      ins.run(i + 1, gloss);
      ++any;
    }
    console.log(`  ${glossTable}: ${any} glosses`);
  }
  console.log(`${spec.table}: ${master.length} entradas maestras`);
});

function fileExists(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

for (const [src, spec] of Object.entries(SOURCES)) buildSource(src, spec);

db.close();
console.log("OK:", OUT);
