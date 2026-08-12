import type Database from "better-sqlite3";
import { type Migration, runMigrations } from "./runner.ts";
import { migrations001_005 } from "./001-005.ts";
import { migrations006_010 } from "./006-010.ts";
import { migrations011_020 } from "./011-020.ts";

/** Las 20 migraciones del legacy (myapp/migrations/001-020), en orden. */
export const migrations: Migration[] = [
  ...migrations001_005,
  ...migrations006_010,
  ...migrations011_020,
];

export function migrateToLatest(db: Database.Database): string[] {
  return runMigrations(db, migrations);
}
