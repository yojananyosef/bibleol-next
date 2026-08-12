import { type Migration, addColumnIfMissing, columnExists, tableExists } from "./runner.ts";

/** 011_gdpr — columnas de política de privacidad en user. */
const migration011: Migration = {
  version: 11,
  name: "gdpr",
  up(db) {
    const out: string[] = [];
    for (const [col, def] of [
      ["accept_policy", "INTEGER NOT NULL DEFAULT 0"],
      ["policy_lang", "TEXT DEFAULT NULL"],
      ["acc_code", "TEXT DEFAULT NULL"],
      ["acc_code_time", "INTEGER NOT NULL DEFAULT 0"],
    ] as const) {
      const r = addColumnIfMissing(db, "bol_user", col, def);
      if (r) out.push(r);
    }
    return out;
  },
};

/** 012_bootstrap4 — renombra iconos glyphicon-* → l-icon-* en heb_urls. */
const migration012: Migration = {
  version: 12,
  name: "bootstrap4",
  up(db) {
    const out: string[] = [];
    const icons: [string, string][] = [
      ["glyphicon-link", "l-icon-link"],
      ["glyphicon-file", "l-icon-file"],
      ["glyphicon-music", "l-icon-music"],
      ["glyphicon-picture", "l-icon-picture"],
      ["glyphicon-film", "l-icon-film"],
      ["glyphicon-volume-down", "l-icon-speaker"],
      ["glyphicon-book", "l-icon-book"],
      ["glyphicon-globe", "l-icon-globe"],
      ["bolicon-logos", "l-icon-logos"],
    ];
    for (const [old, next] of icons) {
      const info = db
        .prepare("UPDATE bol_heb_urls SET icon = ? WHERE icon = ?")
        .run(next, old);
      if (info.changes > 0) out.push(`icon ${old} → ${next} (${info.changes})`);
    }
    return out;
  },
};

/** 013_language_variants — prefvariant en user. */
const migration013: Migration = {
  version: 13,
  name: "language_variants",
  up(db) {
    const out: string[] = [];
    const r = addColumnIfMissing(db, "bol_user", "prefvariant", "TEXT DEFAULT NULL");
    if (r) out.push(r);
    return out;
  },
};

/** 014_language_packs — translation_languages + renombrado zh-simp/zh-trad. */
const migration014: Migration = {
  version: 14,
  name: "language_packs",
  up(db) {
    const out: string[] = [];
    if (!tableExists(db, "bol_translation_languages")) {
      db.exec(
        "CREATE TABLE bol_translation_languages (id INTEGER NOT NULL, abb TEXT NOT NULL, internal TEXT NOT NULL, native TEXT NOT NULL, iface_enabled INTEGER NOT NULL, heblex_enabled INTEGER NOT NULL, greeklex_enabled INTEGER NOT NULL, PRIMARY KEY (id))",
      );
      out.push("Create 'translation_languages'");
    }
    const langnames: Record<string, [string, string]> = {
      da: ["danish", "Dansk"],
      en: ["english", "English"],
      de: ["german", "Deutsch"],
      fr: ["french", "Français"],
      nl: ["dutch", "Nederlands"],
      pt: ["portuguese", "Português"],
      es: ["spanish", "Español"],
      "zh-Hans": ["simp_chinese", "中文（简体）"],
      "zh-Hant": ["trad_chinese", "中文（繁體）"],
      am: ["amharic", "አማርኛ"],
      sw: ["swahili", "Kiswahili"],
    };
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM bol_translation_languages")
      .get() as { n: number };
    if (count.n === 0) {
      const insert = db.prepare(
        "INSERT INTO bol_translation_languages (abb, internal, native, iface_enabled, heblex_enabled, greeklex_enabled) VALUES (?, ?, ?, 0, 0, 0)",
      );
      for (const [abb, [internal, native]] of Object.entries(langnames)) {
        insert.run(abb, internal, native);
      }
    }
    for (const abb of ["am", "da", "de", "en", "es", "fr", "nl", "pt", "zh-Hans", "zh-Hant"]) {
      db.prepare("UPDATE bol_translation_languages SET iface_enabled = 1 WHERE abb = ?").run(abb);
    }
    for (const abb of ["am", "da", "de", "en", "es", "nl", "sw"]) {
      db.prepare("UPDATE bol_translation_languages SET heblex_enabled = 1 WHERE abb = ?").run(abb);
    }
    for (const abb of ["am", "en", "nl", "sw"]) {
      db.prepare("UPDATE bol_translation_languages SET greeklex_enabled = 1 WHERE abb = ?").run(abb);
    }
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'bol\\_language\\_zh\\_%' ESCAPE '\\'")
      .all() as { name: string }[];
    for (const { name } of tables) {
      const rest = name.replace("bol_language_zh-", "");
      let newName: string | null = null;
      if (rest.startsWith("simp")) newName = `bol_language_zh-Hans${rest.slice(4)}`;
      if (rest.startsWith("trad")) newName = `bol_language_zh-Hant${rest.slice(4)}`;
      if (newName) {
        db.exec(`ALTER TABLE ${name} RENAME TO ${newName}`);
        out.push(`Rename ${name} to ${newName}`);
      }
    }
    if (tableExists(db, "bol_db_localize")) {
      db.prepare("UPDATE bol_db_localize SET lang = 'zh-Hans' WHERE lang = 'zh-simp'").run();
      db.prepare("UPDATE bol_db_localize SET lang = 'zh-Hant' WHERE lang = 'zh-trad'").run();
    }
    return out;
  },
};

/** 015_exam_mode — tot_questions en sta_quiz + tablas exam*. */
const migration015: Migration = {
  version: 15,
  name: "exam_mode",
  up(db) {
    const out: string[] = [];
    if (tableExists(db, "bol_exam")) {
      out.push("Exam table already exists");
      return out;
    }
    const r = addColumnIfMissing(
      db,
      "bol_sta_quiz",
      "tot_questions",
      "INTEGER NOT NULL DEFAULT 0",
    );
    if (r) out.push(r);
    db.exec(`CREATE TABLE bol_exam (
      id INTEGER NOT NULL, exam_name TEXT NOT NULL, ownerid INTEGER NOT NULL,
      examcode TEXT DEFAULT NULL, examcodehash TEXT NOT NULL, PRIMARY KEY (id)
    )`);
    db.exec(`CREATE TABLE bol_exam_active (
      id INTEGER NOT NULL, exam_name TEXT NOT NULL, class_id INTEGER NOT NULL,
      exam_start_time INTEGER NOT NULL, exam_end_time INTEGER NOT NULL,
      exam_length INTEGER DEFAULT NULL, exam_id INTEGER DEFAULT NULL,
      instance_name TEXT NOT NULL, PRIMARY KEY (id)
    )`);
    db.exec(`CREATE TABLE bol_exam_finished (
      id INTEGER NOT NULL, userid INTEGER NOT NULL, activeexamid INTEGER NOT NULL, PRIMARY KEY (id)
    )`);
    db.exec(`CREATE TABLE bol_exam_results (
      id INTEGER NOT NULL, userid INTEGER NOT NULL, activeexamid INTEGER NOT NULL,
      quizid INTEGER NOT NULL, quiztemplid INTEGER NOT NULL, PRIMARY KEY (id)
    )`);
    db.exec(`CREATE TABLE bol_exam_status (
      id INTEGER NOT NULL, userid INTEGER NOT NULL, activeexamid INTEGER NOT NULL,
      start_time INTEGER NOT NULL, deadline INTEGER NOT NULL, PRIMARY KEY (id)
    )`);
    out.push("Create exam tables");
    return out;
  },
};

/** 016_exam_mode2 — FKs de exam_active/finished/results/status (ya en esquema). */
const migration016: Migration = {
  version: 16,
  name: "exam_mode2",
  up() {
    return ["(foreign keys already defined in schema)"];
  },
};

/** 017_exam_mode_3 — archived en exam. */
const migration017: Migration = {
  version: 17,
  name: "exam_mode_3",
  up(db) {
    const out: string[] = [];
    const r = addColumnIfMissing(db, "bol_exam", "archived", "INTEGER NOT NULL DEFAULT 0");
    if (r) out.push(r);
    return out;
  },
};

/** 018_vulgate — latinlex_enabled + lexicon_latin + alphabet/font latin. */
const migration018: Migration = {
  version: 18,
  name: "vulgate",
  up(db) {
    const out: string[] = [];
    const r = addColumnIfMissing(
      db,
      "bol_translation_languages",
      "latinlex_enabled",
      "INTEGER NOT NULL DEFAULT 0",
    );
    if (r) out.push(r);
    if (!tableExists(db, "bol_lexicon_latin")) {
      db.exec(`CREATE TABLE bol_lexicon_latin (
        id INTEGER NOT NULL, lemma TEXT NOT NULL, part_of_speech TEXT NOT NULL,
        tally INTEGER NOT NULL, sortorder TEXT NOT NULL, firstbook TEXT NOT NULL,
        firstchapter INTEGER NOT NULL, firstverse INTEGER NOT NULL, PRIMARY KEY (id)
      )`);
      out.push("Create 'lexicon_latin'");
    }
    if (columnExists(db, "bol_alphabet", "sample")) {
      db.prepare(
        "UPDATE bol_alphabet SET sample = 'liber generationis Iesu Christi filii David filii Abraham' WHERE name = 'latin'",
      ).run();
    }
    db.prepare(
      "UPDATE bol_font SET font_family = 'Titillium, Segoe UI, Arial, sans-serif' WHERE user_id = 0 AND alphabet_id = 4",
    ).run();
    return out;
  },
};

/** 019_latin2 — latin2lex_enabled + lexicon_latin2. */
const migration019: Migration = {
  version: 19,
  name: "latin2",
  up(db) {
    const out: string[] = [];
    const r = addColumnIfMissing(
      db,
      "bol_translation_languages",
      "latin2lex_enabled",
      "INTEGER NOT NULL DEFAULT 0",
    );
    if (r) out.push(r);
    if (!tableExists(db, "bol_lexicon_latin2")) {
      db.exec(`CREATE TABLE bol_lexicon_latin2 (
        id INTEGER NOT NULL, lemma TEXT NOT NULL, part_of_speech TEXT NOT NULL,
        tally INTEGER NOT NULL, sortorder TEXT NOT NULL, firstbook TEXT NOT NULL,
        firstchapter INTEGER NOT NULL, firstverse INTEGER NOT NULL, PRIMARY KEY (id)
      )`);
      out.push("Create 'lexicon_latin2'");
    }
    return out;
  },
};

/** 020_del_latin2 — elimina latin2 (no-op en BD del proyecto: el esquema lo conserva). */
const migration020: Migration = {
  version: 20,
  name: "del_latin2",
  up(db) {
    const out: string[] = [];
    const dropped = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('bol_lexicon_latin2', 'bol_db_localize')",
      )
      .all() as { name: string }[];
    if (dropped.some((t) => t.name === "bol_lexicon_latin2")) {
      out.push("(bol_lexicon_latin2 preserved: jvulgate corpus still in use)");
    }
    return out;
  },
};

export const migrations011_020: Migration[] = [
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
];
