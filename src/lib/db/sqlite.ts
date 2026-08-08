import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const DATA_DIR = process.env.BIBLEOL_DATA_DIR ?? path.join(process.cwd(), "data");
export const APP_DB_FILE = path.join(DATA_DIR, "app.db");
export const CORPUS_DIR = path.join(DATA_DIR, "corpus");
export const QUIZZES_DIR = path.join(DATA_DIR, "quizzes");

const SCHEMA_FILE = path.join(process.cwd(), "db", "schema.sqlite.sql");

let appDb: Database.Database | null = null;

/** Abre (y crea si falta) la BD de aplicación con el esquema bol_* 1:1. */
export function getAppDb(): Database.Database {
  if (appDb) return appDb;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(APP_DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  appDb = db;
  return db;
}

/** Aplica el esquema bol_* idempotente (recrea tablas solo si no existen). */
export function applySchema(db: Database.Database): void {
  const n = db
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'bol\\_%' ESCAPE '\\'")
    .get() as { n: number };
  if (n.n > 0) return;
  db.exec(readFileSync(SCHEMA_FILE, "utf8"));
}

/** Abre una conexión de solo lectura a un corpus Emdros (ETCBC4, nestle1904, jvulgate…). */
export function openCorpusDb(name: string): Database.Database {
  const file = path.join(CORPUS_DIR, name);
  return new Database(file, { readonly: true, fileMustExist: true });
}

export function closeAppDb(): void {
  appDb?.close();
  appDb = null;
}
