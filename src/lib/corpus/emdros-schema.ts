/**
 * emdros-schema.ts — Introspector del esquema SQLite interno de Emdros.
 *
 * Reverse-engineering de las bases Emdros (ETCBC4, nestle1904, jvulgate):
 *  - `<otype>_objects`: `object_id_d`, `first_monad`, (opcional) `last_monad`,
 *    (opcional) `monads` (texto comprimido Emdros), columnas `mdf_<feature>`.
 *  - Enums: `mdf_<feat>` INT → `enumeration_constants` (enum_id, value, name).
 *    `feature_type_id` en `features` codifica kind en byte bajo:
 *      0=integer, 1/2=string inline, 3=id_d, 4=enum (enum_id = id & ~0xff),
 *      12=enum multi (columna TEXT con valores separados por espacios).
 *  - Strings: `mdf_<feat>` INT → `<otype>_mdf_<feat>_set` (id_d ↔ string_value).
 *  - `min_m`/`max_m`: límites globales del universo.
 *
 * Algunas bases (nestle1904) omiten `last_monad`/`monads` para objetos de
 * monad único (word) → el monadset es {first_monad..first_monad}.
 */

import Database from "better-sqlite3";
import { OlMonadSet } from "./monads.ts";

export type FeatureKind = "integer" | "string" | "enum" | "id_d";

export interface FeatureInfo {
  /** Nombre de la feature tal como la ve el usuario (sin prefijo mdf_). */
  name: string;
  /** feature_type_id crudo de la tabla `features` (0 si no listada). */
  typeId: number;
  kind: FeatureKind;
  /** enum_id si kind === 'enum'. */
  enumId: number | null;
  /** Existe la tabla `<otype>_mdf_<feat>_set` (resolución id_d → string). */
  hasSetTable: boolean;
  /** Tipo SQL declarado de la columna `mdf_<feat>` (o null si no existe). */
  columnType: string | null;
}

export interface ObjectTypeInfo {
  name: string;
  table: string;
  /** La tabla tiene columna `monads` (texto comprimido Emdros). */
  hasMonads: boolean;
  features: Map<string, FeatureInfo>;
}

export interface EmdrosDb {
  db: Database.Database;
  name: string;
  minM: number;
  maxM: number;
  objectTypes: Map<string, ObjectTypeInfo>;
}

const FEATURE_KINDS: Record<number, FeatureKind> = {
  0: "integer",
  1: "string",
  2: "string",
  3: "id_d",
  4: "enum",
  12: "enum",
};

interface CacheLike<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
}

function cacheGet<K, V>(map: CacheLike<K, V>, key: K, factory: () => V): V {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const val = factory();
  map.set(key, val);
  return val;
}

/** Abre un corpus Emdros y construye el esquema introspectado. */
export function openEmdros(db: Database.Database, name: string): EmdrosDb {
  const minRow = db.prepare("SELECT min_m FROM min_m LIMIT 1").get() as { min_m: number } | undefined;
  const maxRow = db.prepare("SELECT max_m FROM max_m LIMIT 1").get() as { max_m: number } | undefined;

  const objectTypes = new Map<string, ObjectTypeInfo>();
  const typeRows = db
    .prepare("SELECT object_type_name FROM object_types ORDER BY object_type_id")
    .all() as { object_type_name: string }[];

  for (const { object_type_name: otName } of typeRows) {
    const table = `${otName}_objects`;
    const pragma = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as {
      name: string;
      type: string;
    }[];
    if (pragma.length === 0) continue;
    const cols = new Map(pragma.map((c) => [c.name, c.type.toUpperCase()]));

    const features = new Map<string, FeatureInfo>();
    const featRows = db
      .prepare(
        "SELECT feature_name, feature_type_id FROM features WHERE object_type_id = (SELECT object_type_id FROM object_types WHERE object_type_name = ?)",
      )
      .all(otName) as { feature_name: string; feature_type_id: number }[];
    const featTypes = new Map(featRows.map((f) => [f.feature_name, f.feature_type_id]));

    for (const [colName, colType] of cols) {
      if (!colName.startsWith("mdf_")) continue;
      const featName = colName.slice(4);
      const typeId = featTypes.get(colName) ?? 0;
      const kind = FEATURE_KINDS[typeId & 0xff] ?? "integer";
      const enumId = kind === "enum" ? typeId & ~0xff : null;
      const setTable = `${table.replace("_objects", "")}_mdf_${featName}_set`;
      const hasSetTable =
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(setTable) as { n: number };
      features.set(featName, {
        name: featName,
        typeId,
        kind,
        enumId,
        hasSetTable: hasSetTable.n > 0,
        columnType: colType,
      });
    }

    objectTypes.set(otName, {
      name: otName,
      table,
      hasMonads: cols.has("monads"),
      features,
    });
  }

  return {
    db,
    name,
    minM: minRow?.min_m ?? 1,
    maxM: maxRow?.max_m ?? 0,
    objectTypes,
  };
}

export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

export function getObjectType(emd: EmdrosDb, otype: string): ObjectTypeInfo {
  const ot = emd.objectTypes.get(otype);
  if (!ot) throw new Error(`Unknown object type: ${otype}`);
  return ot;
}

/** Info de una feature (más amable con/sin prefijo mdf_). */
export function featureInfo(emd: EmdrosDb, otype: string, feat: string): FeatureInfo {
  const ot = getObjectType(emd, otype);
  const f =
    ot.features.get(feat) ?? ot.features.get(feat.replace(/^mdf_/, ""));
  if (!f) throw new Error(`Unknown feature ${otype}.${feat}`);
  return f;
}

const enumNameCache = new WeakMap<EmdrosDb, Map<number, string>>();
const enumValuesCache = new WeakMap<EmdrosDb, Map<number, Map<number, string>>>();

/** enum_id → nombre de enumeración. */
export function enumName(emd: EmdrosDb, enumId: number): string | null {
  const cache = cacheGet(enumNameCache, emd, () => new Map());
  return cacheGet(cache, enumId, () => {
    const row = emd.db
      .prepare("SELECT enum_name FROM enumerations WHERE enum_id = ?")
      .get(enumId) as { enum_name: string } | undefined;
    return row?.enum_name ?? null;
  });
}

/** enum_id → (value → enum_value_name). */
export function enumValues(emd: EmdrosDb, enumId: number): Map<number, string> {
  const cache = cacheGet(enumValuesCache, emd, () => new Map());
  return cacheGet(cache, enumId, () => {
    const rows = emd.db
      .prepare("SELECT value, enum_value_name FROM enumeration_constants WHERE enum_id = ?")
      .all(enumId) as { value: number; enum_value_name: string }[];
    return new Map(rows.map((r) => [r.value, r.enum_value_name]));
  });
}

const setStmtCache = new WeakMap<EmdrosDb, Map<string, Database.Statement>>();

/** Resuelve un id de la tabla `<otype>_mdf_<feat>_set` a su string. */
export function stringValue(emd: EmdrosDb, otype: string, feat: string, id: number): string | null {
  const ot = getObjectType(emd, otype);
  const f = featureInfo(emd, otype, feat);
  if (!f.hasSetTable) return null;
  const stmtCache = cacheGet(setStmtCache, emd, () => new Map());
  const key = `${ot.name}_${feat}`;
  const stmt = cacheGet(stmtCache, key, () =>
    emd.db.prepare(
      `SELECT string_value FROM ${quoteIdent(
        `${ot.table.replace("_objects", "")}_mdf_${feat}_set`,
      )} WHERE id_d = ?`,
    ),
  );
  const row = stmt.get(id) as { string_value: string } | undefined;
  return row?.string_value ?? null;
}

/**
 * Resuelve el valor crudo de una columna mdf_ a su representación de string
 * (equivalente a `get_feature()` del motor Emdros):
 *  - enum: nombre del valor ('none' → '')
 *  - string inline (TEXT): el texto tal cual
 *  - string por set: string_value de la tabla set
 *  - integer/id_d: número como string
 */
export function resolveFeatureValue(
  emd: EmdrosDb,
  otype: string,
  feat: string,
  raw: number | string | null | undefined,
): string {
  const f = featureInfo(emd, otype, feat);
  if (raw === null || raw === undefined) return "";
  // String inline (columna TEXT) o string vía tabla set (columna INT)
  if (f.kind === "string") {
    if (f.columnType === "TEXT") return String(raw);
    if (f.hasSetTable && typeof raw === "number") {
      return stringValue(emd, otype, feat, raw) ?? "";
    }
    return String(raw);
  }
  if (f.kind === "enum" && f.enumId !== null) {
    const vals = enumValues(emd, f.enumId);
    if (typeof raw !== "number") {
      // Enum multi en columna TEXT (ETCBC4.mdf_verb_class: ' 3 6 ')
      return String(raw)
        .trim()
        .split(/\s+/)
        .filter((p) => p !== "")
        .map((p) => vals.get(Number(p)) ?? "")
        .join(" ");
    }
    return vals.get(raw) ?? "";
  }
  if (f.kind === "integer" || f.kind === "id_d") {
    return String(raw);
  }
  return String(raw);
}

/** Monadset de un objeto a partir de su fila (first_monad + monads opcional). */
export function objectMonadSet(emd: EmdrosDb, otype: string, row: Record<string, unknown>): OlMonadSet {
  const ot = getObjectType(emd, otype);
  const first = Number(row.first_monad ?? row.mdf_monad_num);
  if (ot.hasMonads && typeof row.monads === "string" && row.monads !== "") {
    return OlMonadSet.fromCompactString(row.monads);
  }
  return new OlMonadSet([{ low: first, high: first }]);
}

/** Convierte un OlMonadSet a una lista de pares para cláusulas SQL. */
export function monadRanges(ms: OlMonadSet): Array<[number, number]> {
  return ms.segments.map((p) => [p.low, p.high]);
}
