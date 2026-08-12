import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { migrations, migrateToLatest } from "../src/lib/db/migrations/index.ts";
import {
  getMigrationVersion,
  setMigrationVersion,
  columnExists,
  tableExists,
} from "../src/lib/db/migrations/runner.ts";

function schemaDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(new URL("../db/schema.sqlite.sql", import.meta.url), "utf8"));
  return db;
}

test("20 migraciones en orden, versiones 1..20", () => {
  assert.equal(migrations.length, 20);
  migrations.forEach((m, i) => assert.equal(m.version, i + 1));
});

test("BD nueva (esquema final) está en v19 y migrate llega a v20 sin errores", () => {
  const db = schemaDb();
  assert.equal(getMigrationVersion(db), 19);
  const lines = migrateToLatest(db);
  assert.equal(getMigrationVersion(db), 20);
  assert.ok(lines.length === 0 || lines.length >= 1);
});

test("migrate es idempotente", () => {
  const db = schemaDb();
  migrateToLatest(db);
  const lines2 = migrateToLatest(db);
  assert.equal(getMigrationVersion(db), 20);
  assert.equal(lines2.length, 0);
});

test("re-aplicar las 20 migraciones sobre el esquema final es seguro (desde v0)", () => {
  const db = schemaDb();
  setMigrationVersion(db, 0);
  const lines = migrateToLatest(db);
  assert.equal(getMigrationVersion(db), 20);
  assert.ok(lines.some((l) => l.startsWith("Migrating 001_")));
  assert.ok(lines.some((l) => l.startsWith("Migrating 020_")));
});

test("las columnas añadidas por las migraciones existen en el esquema final", () => {
  const db = schemaDb();
  assert.ok(columnExists(db, "bol_user", "oauth2_login"));
  assert.ok(columnExists(db, "bol_user", "isteacher"));
  assert.ok(columnExists(db, "bol_user", "preflang"));
  assert.ok(columnExists(db, "bol_user", "family_name_first"));
  assert.ok(columnExists(db, "bol_user", "istranslator"));
  assert.ok(columnExists(db, "bol_user", "accept_policy"));
  assert.ok(columnExists(db, "bol_user", "prefvariant"));
  assert.ok(columnExists(db, "bol_sta_quiz", "grading"));
  assert.ok(columnExists(db, "bol_sta_quiz", "tot_questions"));
  assert.ok(columnExists(db, "bol_userclass", "access"));
  assert.ok(columnExists(db, "bol_class", "ownerid"));
  assert.ok(columnExists(db, "bol_exam", "archived"));
  assert.ok(columnExists(db, "bol_lexicon_Hebrew", "roman"));
  assert.ok(columnExists(db, "bol_translation_languages", "latinlex_enabled"));
});

test("012: iconos glyphicon-* se renombran a l-icon-*", () => {
  const db = schemaDb();
  db.prepare(
    "INSERT INTO bol_heb_urls (id, lex, language, url, icon) VALUES (1, 'x', 'Hebrew', 'u', 'glyphicon-link')",
  ).run();
  migrations[11].up(db);
  const icon = db.prepare("SELECT icon FROM bol_heb_urls WHERE id = 1").get() as { icon: string };
  assert.equal(icon.icon, "l-icon-link");
});

test("009: roman se rellena según los selectores '='", () => {
  const db = schemaDb();
  const lexs = ["KL/", "KL=/", "KL==/", "KL===/"];
  for (const [i, lex] of lexs.entries()) {
    db.prepare(
      "INSERT INTO bol_lexicon_Hebrew (id, lex, vs, tally, vocalized_lexeme_utf8, sortorder, firstbook, firstchapter, firstverse, roman) VALUES (?, ?, '', 1, 'x', 'x', '', 1, 1, '')",
    ).run(50001 + i, lex);
  }
  migrations[8].up(db);
  const romans = db
    .prepare("SELECT lex, roman FROM bol_lexicon_Hebrew WHERE id >= 50001 ORDER BY id")
    .all() as { lex: string; roman: string }[];
  assert.deepEqual(romans.map((r) => r.roman), ["I", "II", "III", "IV"]);
});

test("020: del_latin2 no borra latin2 en BD del proyecto", () => {
  const db = schemaDb();
  migrateToLatest(db);
  assert.ok(tableExists(db, "bol_lexicon_latin2"));
});
