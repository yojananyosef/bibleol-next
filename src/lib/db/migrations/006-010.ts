import { type Migration, addColumnIfMissing, tableExists } from "./runner.ts";
import {
  etcbc4v8Stems,
  etcbc4v8ToAdd,
  etcbc4v8ToCopy,
  etcbc4v8ToRemove,
  etcbc4v8ToReplace,
  w2sMap,
  wordFeatMap,
} from "./etcbc4v8-data.ts";

/** 006_split_heb — divide lexicon_heb en lexicon_Hebrew / lexicon_Aramaic. */
const migration006: Migration = {
  version: 6,
  name: "split_heb",
  up(db) {
    const out: string[] = [];
    if (!tableExists(db, "bol_lexicon_heb")) return ["(lexicon_heb already split)"];
    for (const srclang of ["Hebrew", "Aramaic"]) {
      db.exec(
        `CREATE TABLE IF NOT EXISTS bol_lexicon_${srclang} (id INTEGER NOT NULL, lex TEXT NOT NULL, vs TEXT NOT NULL, tally INTEGER NOT NULL, vocalized_lexeme_utf8 TEXT NOT NULL, sortorder TEXT NOT NULL, firstbook TEXT NOT NULL, firstchapter INTEGER NOT NULL, firstverse INTEGER NOT NULL, PRIMARY KEY (id))`,
      );
      for (const dstlang of ["en", "de", "da"]) {
        db.exec(
          `CREATE TABLE IF NOT EXISTS bol_lexicon_${srclang}_${dstlang} (id INTEGER NOT NULL, lex_id INTEGER DEFAULT NULL, gloss TEXT NOT NULL, PRIMARY KEY (id))`,
        );
      }
    }
    const insertMain = db.prepare(
      `INSERT INTO bol_lexicon_Hebrew (id, lex, vs, tally, vocalized_lexeme_utf8, sortorder, firstbook, firstchapter, firstverse)
       SELECT id, lex, vs, tally, vocalized_lexeme_utf8, sortorder, firstbook, firstchapter, firstverse FROM bol_lexicon_heb WHERE language = 'Hebrew'`,
    );
    const insertAram = db.prepare(
      `INSERT INTO bol_lexicon_Aramaic (id, lex, vs, tally, vocalized_lexeme_utf8, sortorder, firstbook, firstchapter, firstverse)
       SELECT id, lex, vs, tally, vocalized_lexeme_utf8, sortorder, firstbook, firstchapter, firstverse FROM bol_lexicon_heb WHERE language = 'Aramaic'`,
    );
    insertMain.run();
    insertAram.run();
    const hebrewIds = new Set(
      (db.prepare("SELECT id FROM bol_lexicon_heb WHERE language = 'Hebrew'").all() as { id: number }[]).map(
        (r) => r.id,
      ),
    );
    for (const dstlang of ["en", "de", "da"]) {
      const rows = db
        .prepare(`SELECT lex_id, gloss FROM bol_lexicon_heb_${dstlang}`)
        .all() as { lex_id: number; gloss: string }[];
      const target = db.prepare(
        `INSERT INTO bol_lexicon_Hebrew_${dstlang} (lex_id, gloss) VALUES (?, ?)`,
      );
      const targetAram = db.prepare(
        `INSERT INTO bol_lexicon_Aramaic_${dstlang} (lex_id, gloss) VALUES (?, ?)`,
      );
      for (const r of rows) {
        if (hebrewIds.has(r.lex_id)) target.run(r.lex_id, r.gloss);
        else targetAram.run(r.lex_id, r.gloss);
      }
      out.push(`Populating lexicon_Hebrew_${dstlang}`);
    }
    for (const t of ["bol_lexicon_heb", "bol_lexicon_heb_en", "bol_lexicon_heb_de", "bol_lexicon_heb_da"]) {
      db.exec(`DROP TABLE IF EXISTS ${t}`);
      out.push(`Dropping table ${t}`);
    }
    return out;
  },
};

function wit2sort(wit: string): string {
  let out = "";
  for (const ch of wit) out += w2sMap[ch] ?? "";
  return out;
}

/** 007_etcbc4_v8 — limpieza de lexicon_Hebrew: remove/replace/add/copy palabras y stems. */
const migration007: Migration = {
  version: 7,
  name: "etcbc4_v8",
  up(db) {
    const out: string[] = [];

    for (const word of etcbc4v8ToRemove) {
      db.prepare("DELETE FROM bol_lexicon_Hebrew WHERE lex = ?").run(word);
      db.prepare("DELETE FROM bol_heb_urls WHERE lex = ? AND language = 'Hebrew'").run(word);
    }

    const hasGloss = tableExists(db, "bol_lexicon_Hebrew_en");

    for (const [old, [newLex, newVoclex, enOld, enNew, deOld, deNew]] of Object.entries(
      etcbc4v8ToReplace,
    )) {
      db.prepare(
        "UPDATE bol_lexicon_Hebrew SET lex = ?, vocalized_lexeme_utf8 = ?, sortorder = ? WHERE lex = ?",
      ).run(newLex, newVoclex, wit2sort(String(newLex)), old);
      db.prepare("UPDATE bol_heb_urls SET lex = ? WHERE lex = ? AND language = 'Hebrew'").run(
        newLex,
        old,
      );
      if (enOld !== undefined && hasGloss) {
        const lex = db.prepare("SELECT id FROM bol_lexicon_Hebrew WHERE lex = ?").get(newLex) as
          | { id: number }
          | undefined;
        if (!lex) continue;
        db.prepare("UPDATE bol_lexicon_Hebrew_en SET gloss = ? WHERE lex_id = ? AND gloss = ?").run(
          enNew,
          lex.id,
          enOld,
        );
        db.prepare("UPDATE bol_lexicon_Hebrew_de SET gloss = ? WHERE lex_id = ? AND gloss = ?").run(
          deNew,
          lex.id,
          deOld,
        );
      }
    }

    for (const [lex, oldStem, newStem] of etcbc4v8Stems) {
      db.prepare("UPDATE bol_lexicon_Hebrew SET vs = ? WHERE lex = ? AND vs = ?").run(
        newStem,
        lex,
        oldStem,
      );
    }

    for (const [lex, stem, voclex, tally, book, chap, verse, en, de] of etcbc4v8ToAdd) {
      const info = db
        .prepare(
          "INSERT INTO bol_lexicon_Hebrew (lex, vs, tally, vocalized_lexeme_utf8, sortorder, firstbook, firstchapter, firstverse) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(lex, stem, tally, voclex, wit2sort(String(lex)), book, chap, verse);
      const lexId = Number(info.lastInsertRowid);
      if (hasGloss) {
        db.prepare("INSERT INTO bol_lexicon_Hebrew_en (lex_id, gloss) VALUES (?, ?)").run(lexId, en);
        db.prepare("INSERT INTO bol_lexicon_Hebrew_de (lex_id, gloss) VALUES (?, ?)").run(lexId, de);
        db.prepare("INSERT INTO bol_lexicon_Hebrew_da (lex_id, gloss) VALUES (?, '*')").run(lexId);
      }
    }

    for (const [lex, oldStem, oldBook, oldChap, oldVerse, newStem, newBook, newChap, newVerse] of etcbc4v8ToCopy) {
      const src = db
        .prepare("SELECT * FROM bol_lexicon_Hebrew WHERE lex = ? AND vs = ?")
        .get(lex, oldStem) as
        | { id: number; tally: number; vocalized_lexeme_utf8: string; sortorder: string }
        | undefined;
      if (!src) {
        out.push(`ERROR: Lex ${lex} stem ${oldStem} is not in lexicon_Hebrew`);
        continue;
      }
      db.prepare(
        "UPDATE bol_lexicon_Hebrew SET firstbook = ?, firstchapter = ?, firstverse = ? WHERE id = ?",
      ).run(oldBook, oldChap, oldVerse, src.id);
      const info = db
        .prepare(
          "INSERT INTO bol_lexicon_Hebrew (lex, vs, tally, vocalized_lexeme_utf8, sortorder, firstbook, firstchapter, firstverse) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(lex, newStem, src.tally, src.vocalized_lexeme_utf8, src.sortorder, newBook, newChap, newVerse);
      const newId = Number(info.lastInsertRowid);
      for (const lang of ["en", "de", "da"]) {
        if (!hasGloss) break;
        const gloss = db
          .prepare(`SELECT gloss FROM bol_lexicon_Hebrew_${lang} WHERE lex_id = ?`)
          .get(src.id) as { gloss: string } | undefined;
        if (!gloss) continue;
        db.prepare(`INSERT INTO bol_lexicon_Hebrew_${lang} (lex_id, gloss) VALUES (?, ?)`).run(
          newId,
          gloss.gloss,
        );
      }
    }

    return out;
  },
};

/** 008_etcbc4_v8a — renombra features de ETCBC4 en quizzes (update_statistics). */
const migration008: Migration = {
  version: 8,
  name: "etcbc4_v8a",
  up(db) {
    const out: string[] = [];
    for (const feature of ["bol_sta_displayfeature", "bol_sta_requestfeature"]) {
      if (!tableExists(db, feature)) continue;
      const rows = db
        .prepare(
          `SELECT feat.id, feat.name FROM bol_sta_quiztemplate qt
           JOIN bol_sta_quiz qz ON qz.templid = qt.id
           JOIN bol_sta_question quest ON quest.quizid = qz.id
           JOIN ${feature} feat ON feat.questid = quest.id
           WHERE qt.dbname = 'ETCBC4' AND qt.qoname = 'word'`,
        )
        .all() as { id: number; name: string }[];
      let count = 0;
      for (const row of rows) {
        const newName = wordFeatMap[row.name];
        if (!newName) continue;
        db.prepare(`UPDATE ${feature} SET name = ? WHERE id = ?`).run(newName, row.id);
        count++;
      }
      out.push(`Updated ${feature}: ${count} features`);
    }
    return out;
  },
};

/** 009_roman_num — añade roman a lexicon_Hebrew/Aramaic y corrige letras finales. */
const migration009: Migration = {
  version: 9,
  name: "roman_num",
  up(db) {
    const out: string[] = [];
    for (const lang of ["Hebrew", "Aramaic"]) {
      const r = addColumnIfMissing(db, `bol_lexicon_${lang}`, "roman", "TEXT NOT NULL DEFAULT ''");
      if (r) out.push(r);
    }
    const romanList = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
    const selectorList = ["", "=", "==", "===", "====", "=====", "======", "=======", "========"];
    for (const lang of ["Hebrew", "Aramaic"]) {
      const setOfLex = new Set<string>();
      const rows = db
        .prepare(`SELECT id, lex FROM bol_lexicon_${lang} WHERE lex LIKE '%\\=%' ESCAPE '\\'`)
        .all() as { id: number; lex: string }[];
      for (const row of rows) setOfLex.add(row.lex.replace(/=+/g, ""));
      for (const lex of setOfLex) {
        let suffix = lex[lex.length - 1];
        const naked = suffix === "[" || suffix === "/" ? lex.slice(0, -1) : ((suffix = ""), lex);
        for (let i = 0; i < selectorList.length; ++i) {
          const full = naked + selectorList[i] + suffix;
          db.prepare(`UPDATE bol_lexicon_${lang} SET roman = ? WHERE lex = ?`).run(
            romanList[i],
            full,
          );
        }
      }
    }

    const special: Record<string, string> = {
      "KLNH/": "כַּלְנֵה",
      "JRJXW/": "יְרִחֹו",
    };
    const fromFinal = ["כ ", "מ ", "נ ", "פ ", "צ ", "כְ "];
    const toFinal = ["ך ", "ם ", "ן ", "ף ", "ץ ", "ךְ "];
    for (const lang of ["Hebrew", "Aramaic"]) {
      const rows = db
        .prepare(`SELECT id, lex, vocalized_lexeme_utf8 FROM bol_lexicon_${lang}`)
        .all() as { id: number; lex: string; vocalized_lexeme_utf8: string }[];
      for (const row of rows) {
        let vlu = row.vocalized_lexeme_utf8;
        if (row.lex === "KLNH/" && vlu === "כַּלְנֶה") {
          vlu = special["KLNH/"];
        } else if (row.lex === "JRJXW/" && vlu === "יְרִיחֹו") {
          vlu = special["JRJXW/"];
        } else {
          for (let i = 0; i < fromFinal.length; ++i) {
            vlu = vlu.replaceAll(fromFinal[i], toFinal[i]);
          }
        }
        if (vlu !== row.vocalized_lexeme_utf8) {
          db.prepare(`UPDATE bol_lexicon_${lang} SET vocalized_lexeme_utf8 = ? WHERE id = ?`).run(
            vlu,
            row.id,
          );
        }
      }
    }
    return out;
  },
};

/** 010_teacheraccess — access en userclass. */
const migration010: Migration = {
  version: 10,
  name: "teacheraccess",
  up(db) {
    const out: string[] = [];
    const r = addColumnIfMissing(db, "bol_userclass", "access", "INTEGER NOT NULL DEFAULT 0");
    if (r) out.push(r);
    return out;
  },
};

export const migrations006_010: Migration[] = [
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
];
