import {
  type Migration,
  addColumnIfMissing,
  columnExists,
  dropColumnIfPresent,
  tableExists,
} from "./runner.ts";

/** 001_usermgmt — consistencia de FKs, columnas de gestión de usuarios, ejercicioowner. */
const migration001: Migration = {
  version: 1,
  name: "usermgmt",
  up(db) {
    const out: string[] = [];

    const withUserid = [
      "bol_sta_displayfeature",
      "bol_sta_question",
      "bol_sta_quiz",
      "bol_sta_quiztemplate",
      "bol_sta_requestfeature",
      "bol_sta_universe",
      "bol_userclass",
    ];
    const withUserId = ["bol_personal_font", "bol_userconfig"];

    for (const tab of withUserid) {
      if (!tableExists(db, tab)) continue;
      const orphans = db
        .prepare(`SELECT DISTINCT userid FROM ${tab} WHERE userid NOT IN (SELECT id FROM bol_user)`)
        .all() as { userid: number }[];
      if (orphans.length > 0) {
        const ids = orphans.map((o) => o.userid);
        out.push(`    WARNING: Table ${tab} refers to these unknown user IDs: ${ids.join(" ")}`);
        const placeholders = ids.map(() => "?").join(",");
        db.prepare(`DELETE FROM ${tab} WHERE userid IN (${placeholders})`).run(...ids);
        out.push("    They have been deleted");
      } else {
        out.push(`    Table ${tab} is OK`);
      }
    }

    for (const tab of withUserId) {
      if (!tableExists(db, tab)) continue;
      const orphans = db
        .prepare(`SELECT DISTINCT user_id FROM ${tab} WHERE user_id NOT IN (SELECT id FROM bol_user)`)
        .all() as { user_id: number }[];
      if (orphans.length > 0) {
        const ids = orphans.map((o) => o.user_id);
        out.push(`    WARNING: Table ${tab} refers to these unknown user IDs: ${ids.join(" ")}`);
        const placeholders = ids.map(() => "?").join(",");
        db.prepare(`DELETE FROM ${tab} WHERE user_id IN (${placeholders})`).run(...ids);
        out.push("    They have been deleted");
      } else {
        out.push(`    Table ${tab} is OK`);
      }
    }

    const oauth = addColumnIfMissing(db, "bol_user", "oauth2_login", "TEXT");
    if (oauth) out.push(oauth);
    if (columnExists(db, "bol_user", "google_login")) {
      db.prepare("UPDATE bol_user SET oauth2_login = 'google' WHERE google_login = 1").run();
      out.push("    google_login users copied to oauth2_login");
      const dropped = dropColumnIfPresent(db, "bol_user", "google_login");
      if (dropped) out.push(dropped);
    }
    const wivu = dropColumnIfPresent(db, "bol_user", "may_see_wivu");
    if (wivu) out.push(wivu);

    for (const [col, def] of [
      ["created_time", "INTEGER NOT NULL DEFAULT 0"],
      ["last_login", "INTEGER NOT NULL DEFAULT 0"],
      ["warning_sent", "INTEGER NOT NULL DEFAULT 0"],
      ["isteacher", "INTEGER NOT NULL DEFAULT 0"],
      ["preflang", "TEXT"],
    ] as const) {
      const r = addColumnIfMissing(db, "bol_user", col, def);
      if (r) out.push(r);
    }

    db.prepare("UPDATE bol_user SET preflang = 'none' WHERE preflang IS NULL").run();
    db.prepare("UPDATE bol_user SET isteacher = 1 WHERE isadmin = 1").run();

    const defaultLastLogin = Math.floor(Date.now() / 1000) - 9 * 30 * 24 * 3600;
    if (tableExists(db, "bol_sta_quiz")) {
      const recent = db
        .prepare(
          "SELECT userid, MAX(start) AS maxstart FROM bol_sta_quiz GROUP BY userid HAVING maxstart >= ?",
        )
        .all(defaultLastLogin) as { userid: number; maxstart: number }[];
      for (const row of recent) {
        db.prepare("UPDATE bol_user SET last_login = ? WHERE id = ?").run(row.maxstart, row.userid);
      }
    }
    db.prepare("UPDATE bol_user SET last_login = ? WHERE last_login = 0").run(defaultLastLogin);

    const owner = addColumnIfMissing(db, "bol_class", "ownerid", "INTEGER NOT NULL DEFAULT 0");
    if (owner) out.push(owner);

    if (!tableExists(db, "bol_exerciseowner")) {
      db.exec(
        "CREATE TABLE bol_exerciseowner (id INTEGER NOT NULL, pathname TEXT NOT NULL, ownerid INTEGER NOT NULL, PRIMARY KEY (id))",
      );
      out.push("Table 'exerciseowner' created");
    }

    return out;
  },
};

/** 002_grading — grading en sta_quiz + tabla heb_urls. */
const migration002: Migration = {
  version: 2,
  name: "grading",
  up(db) {
    const out: string[] = [];
    const grading = addColumnIfMissing(db, "bol_sta_quiz", "grading", "INTEGER DEFAULT NULL");
    if (grading) out.push(`Grading ${grading.toLowerCase()}`);
    if (!tableExists(db, "bol_heb_urls")) {
      db.exec(
        "CREATE TABLE bol_heb_urls (id INTEGER NOT NULL, lex TEXT NOT NULL, language TEXT NOT NULL, url TEXT NOT NULL, icon TEXT NOT NULL, PRIMARY KEY (id))",
      );
      out.push("Table heb_urls added");
    }
    return out;
  },
};

/** 003_chinese — family_name_first en user. */
const migration003: Migration = {
  version: 3,
  name: "chinese",
  up(db) {
    const out: string[] = [];
    const r = addColumnIfMissing(db, "bol_user", "family_name_first", "INTEGER NOT NULL DEFAULT 0");
    if (r) out.push(r);
    return out;
  },
};

/** 004_translatedb — istranslator + tablas de idiomas y lexicons (ya en esquema). */
const migration004: Migration = {
  version: 4,
  name: "translatedb",
  up(db) {
    const out: string[] = [];
    const r = addColumnIfMissing(db, "bol_user", "istranslator", "INTEGER NOT NULL DEFAULT 0");
    if (r) out.push(r);
    if (!tableExists(db, "bol_db_localize")) {
      db.exec(
        "CREATE TABLE bol_db_localize (id INTEGER NOT NULL, db TEXT NOT NULL, lang TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (id))",
      );
      out.push("Language tables created");
    }
    for (const t of ["bol_lexicon_Hebrew", "bol_lexicon_Aramaic", "bol_lexicon_greek"]) {
      if (!tableExists(db, t)) {
        db.exec(`CREATE TABLE ${t} (id INTEGER NOT NULL, PRIMARY KEY (id))`);
        out.push(`Table ${t} added`);
      }
    }
    return out;
  },
};

/** 005_danishlex — lexicon_Hebrew_da con gloss '*'. */
const migration005: Migration = {
  version: 5,
  name: "danishlex",
  up(db) {
    const out: string[] = [];
    if (!tableExists(db, "bol_lexicon_Hebrew_da")) {
      db.exec(
        "CREATE TABLE bol_lexicon_Hebrew_da (id INTEGER NOT NULL, lex_id INTEGER DEFAULT NULL, gloss TEXT NOT NULL, PRIMARY KEY (id))",
      );
      const lex = db
        .prepare("SELECT id FROM bol_lexicon_Hebrew ORDER BY id")
        .all() as { id: number }[];
      const insert = db.prepare("INSERT INTO bol_lexicon_Hebrew_da (lex_id, gloss) VALUES (?, '*')");
      db.transaction(() => {
        for (const row of lex) insert.run(row.id);
      })();
      out.push("Inserting lexicon_Hebrew_da");
    }
    return out;
  },
};

export const migrations001_005: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
];
