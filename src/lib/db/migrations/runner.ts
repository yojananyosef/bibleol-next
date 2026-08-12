import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  up(db: Database.Database): string[];
}

/** CI Migration 1:1 (system/libraries/Migration.php): versión actual en bol_migrations. */
export function getMigrationVersion(db: Database.Database): number {
  const row = db.prepare("SELECT version FROM bol_migrations").get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

export function setMigrationVersion(db: Database.Database, version: number): void {
  db.prepare("UPDATE bol_migrations SET version = ?").run(version);
}

/**
 * CI Migration::current() — aplica en orden las migraciones con versión
 * mayor que la registrada hasta target (default: la última). Cada up()
 * devuelve las líneas de log equivalentes a los echo del legacy.
 */
export function runMigrations(
  db: Database.Database,
  migrations: Migration[],
  target = migrations[migrations.length - 1]?.version ?? 0,
): string[] {
  const out: string[] = [];
  if (!tableExists(db, "bol_migrations")) {
    db.exec("CREATE TABLE bol_migrations (version INTEGER NOT NULL)");
    db.prepare("INSERT INTO bol_migrations (version) VALUES (0)").run();
  }
  let current = getMigrationVersion(db);
  for (const m of migrations) {
    if (m.version <= current || m.version > target) continue;
    out.push(`Migrating ${String(m.version).padStart(3, "0")}_${m.name}`);
    out.push(...m.up(db));
    setMigrationVersion(db, m.version);
    current = m.version;
  }
  return out;
}

export function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { n: number };
  return row.n > 0;
}

export function columnExists(db: Database.Database, table: string, column: string): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM pragma_table_info(?) WHERE name = ?")
    .get(table, column) as { n: number };
  return row.n > 0;
}

export function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): string | null {
  if (columnExists(db, table, column)) return null;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return `${column} field added to ${table}`;
}

export function dropColumnIfPresent(
  db: Database.Database,
  table: string,
  column: string,
): string | null {
  if (!columnExists(db, table, column)) return null;
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  return `${column} field dropped from ${table}`;
}
