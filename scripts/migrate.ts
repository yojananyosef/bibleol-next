/**
 * CLI `bun run migrate` — CI Migration::current() 1:1: aplica las
 * migraciones pendientes (bol_migrations) sobre la BD de aplicación.
 */
import { getAppDb } from "../src/lib/db/sqlite.ts";
import { migrateToLatest } from "../src/lib/db/migrations/index.ts";
import { getMigrationVersion } from "../src/lib/db/migrations/runner.ts";

const db = getAppDb();
const before = getMigrationVersion(db);
const lines = migrateToLatest(db);
const after = getMigrationVersion(db);
if (lines.length > 0) console.log(lines.join("\n"));
console.log(`Migration version: ${before} → ${after}`);
