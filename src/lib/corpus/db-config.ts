/**
 * db-config.ts — Réplica 1:1 de `libraries/Db_config.php` + `include/typeinfo.inc.php`
 * de BibleOL.
 *
 * Db_config escanea data/meta (el "db" del legacy) en busca de `*.db.json`,
 * y con initConfig(pr, language) carga dbinfo + localización + typeinfo +
 * bookorder de un corpus, expandiendo las features "gloss" por idioma de
 * léxico (heblex/greeklex/latinlex) tal como hace el PHP.
 *
 * TypeInfo se construye desde el JSON de typeinfo (como Db_config) o desde
 * MQL (SELECT OBJECT TYPES / FEATURES / ENUMERATIONS) para regenerarlo.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { META_DIR, getAppDb } from "../db/sqlite.ts";
import type { Mql } from "./mql.ts";

/** Filas de bol_translation_languages (helpers get_*lex_translations). */
export interface GlossLang {
  id: number;
  abb: string;
  internal: string;
  native: string;
  iface_enabled: number;
  heblex_enabled: number;
  greeklex_enabled: number;
  latinlex_enabled: number;
  latin2lex_enabled: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeInfo (typeinfo.inc.php)
// ─────────────────────────────────────────────────────────────────────────────

export class TypeInfo {
  objTypes: string[];
  obj2feat: Record<string, Record<string, string>>;
  enumTypes: string[];
  enum2values: Record<string, string[]>;

  constructor(json: string) {
    const val = JSON.parse(json);
    this.objTypes = val.objTypes;
    this.obj2feat = val.obj2feat;
    this.enumTypes = val.enumTypes;
    this.enum2values = val.enum2values;
  }

  toJson(): string {
    return JSON.stringify({
      objTypes: this.objTypes,
      obj2feat: this.obj2feat,
      enumTypes: this.enumTypes,
      enum2values: this.enum2values,
    });
  }

  /** Regenera el typeinfo desde MQL (TypeInfo(null) en el PHP). */
  static fromMql(mql: Mql): TypeInfo {
    const objTypes: string[] = [];
    const t1 = mql.exec("SELECT OBJECT TYPES GOqxqxqx")[0].get_table()!;
    for (let r = 0; r < t1.rows(); ++r) objTypes.push(t1.get_cell(r, 0));

    let cmd = "";
    for (const ot of objTypes) cmd += `SELECT FEATURES FROM [${ot}] GOqxqxqx\n`;
    const featResults = mql.exec(cmd);
    if (featResults.length !== objTypes.length)
      throw new Error(`Expected ${objTypes.length} tables but got ${featResults.length}`);
    const obj2feat: Record<string, Record<string, string>> = {};
    for (let i = 0; i < objTypes.length; ++i) {
      const tab = featResults[i].get_table()!;
      const features: Record<string, string> = { self: "id_d" }; // id de objeto Emdros
      for (let r = 0; r < tab.rows(); ++r) features[tab.get_cell(r, 0)] = tab.get_cell(r, 1);
      obj2feat[objTypes[i]] = features;
    }

    const enumTypes: string[] = [];
    const t2 = mql.exec("SELECT ENUMERATIONS GOqxqxqx")[0].get_table()!;
    for (let r = 0; r < t2.rows(); ++r) enumTypes.push(t2.get_cell(r, 0));

    let cmd2 = "";
    for (const en of enumTypes) cmd2 += `SELECT ENUMERATION CONSTANTS FROM ${en} GOqxqxqx\n`;
    const enumResults = mql.exec(cmd2);
    if (enumResults.length !== enumTypes.length)
      throw new Error(`Expected ${enumTypes.length} tables but got ${enumResults.length}`);
    const enum2values: Record<string, string[]> = {};
    for (let i = 0; i < enumTypes.length; ++i) {
      const tab = enumResults[i].get_table()!;
      const values: string[] = [];
      for (let r = 0; r < tab.rows(); ++r) values.push(tab.get_cell(r, 0));
      enum2values[enumTypes[i]] = values;
    }

    return Object.assign(new TypeInfo("{}"), {
      objTypes,
      obj2feat,
      enumTypes,
      enum2values,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// database_file (Db_config.php)
// ─────────────────────────────────────────────────────────────────────────────

export interface DbinfoRaw {
  databaseName?: string;
  propertiesName: string;
  subsetOf?: { properties: string } | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del dbinfo parseado (Dictionary y vistas)
// ─────────────────────────────────────────────────────────────────────────────

export interface GrammarItem {
  mytype: "GrammarFeature" | "GrammarGroup" | "GrammarMetaFeature" | "GrammarSubFeature" | string;
  name?: string;
  items?: GrammarItem[];
}

export interface SentenceGrammar {
  mytype: string;
  objType: string;
  items?: GrammarItem[];
}

export interface FeatureSetting {
  ignoreSelect?: boolean;
  ignoreShow?: boolean;
  ignoreRequest?: boolean;
  isRange?: boolean;
  isGloss?: boolean;
  indirdb?: string;
  sql_command?: string;
  sql_command_variant?: string | null;
  sqlargs?: string[];
  multiple?: boolean;
  fontsize?: string;
  matchregexp?: string;
}

export interface UniverseLevel {
  type: string;
  feat: string;
}

/** Estructura del dbinfo tal como lo usan Dictionary y las vistas. */
export interface Dbinfo {
  databaseName: string;
  propertiesName: string;
  granularity: string;
  surfaceFeature: string;
  suffixFeature?: string;
  objHasSurface: string;
  sentencegrammar: SentenceGrammar[];
  universeHierarchy: UniverseLevel[];
  objectSettings: Record<string, { featuresetting?: Record<string, FeatureSetting> }>;
  picDb?: string;
}

/** Parsea el dbinfo_json y tipa los campos usados por Dictionary. */
export function parseDbinfo(json: string): Dbinfo {
  return JSON.parse(json) as Dbinfo;
}

export class DatabaseFile {
  propertiesName: string;
  subsetOf: string | null;
  /** "db/<databaseName>" — nombre del corpus (sin la carpeta). */
  emdros_db: string;
  /** "<pr>.db.json" */
  dbinfo: string;
  /** "<db>.typeinfo.json" */
  typeinfo: string;
  /** "<db>.bookorder" */
  bookorder: string;

  constructor(dbinfo: DbinfoRaw) {
    const db = dbinfo.databaseName ?? "";
    const pr = dbinfo.propertiesName;
    this.propertiesName = pr;
    this.subsetOf = dbinfo.subsetOf?.properties ?? null;
    this.emdros_db = `db/${db}`;
    this.dbinfo = `db/${pr}.db.json`;
    this.typeinfo = `db/${db}.typeinfo.json`;
    this.bookorder = `db/${db}.bookorder`;
  }

  /** Fetches the name of properties files of a superset database, if any. */
  getSuperProp(): string | null {
    return this.subsetOf;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Db_config
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve el JSON de localización (prop) de un corpus, o null si no existe. */
export type LocalizeGetter = (db: string, lang: string) => string | null;

export class DbConfig {
  /** Mapea propertiesName → database_file de todos los corpora de data/meta. */
  allfiles: Record<string, DatabaseFile>;
  /** Los corpora a mostrar al seleccionar texto (sin superset). */
  allfiles_enumerate: Record<string, DatabaseFile>;

  // Estado del corpus seleccionado con initConfig
  dbinfo_json = "";
  dbinfo: Record<string, unknown> | null = null;
  l10n_json = "";
  typeinfo_json = "";
  typeinfo: TypeInfo | null = null;
  bookorder: string[][] = [];
  emdros_db = "";
  src_lang: string[] = [];
  glosslang: GlossLang[] = [];

  private metaDir: string;
  private localize: LocalizeGetter;
  private glossLangs: (kind: "heblex" | "greeklex" | "latinlex") => GlossLang[];

  constructor(
    metaDir = META_DIR,
    opts: { localize?: LocalizeGetter; glossLangs?: (kind: "heblex" | "greeklex" | "latinlex") => GlossLang[] } = {},
  ) {
    this.metaDir = metaDir;
    this.localize = opts.localize ?? defaultLocalize(metaDir);
    this.glossLangs = opts.glossLangs ?? defaultGlossLangs;

    // Constructor del PHP: escaneo de db/*.db.json
    this.allfiles = {};
    for (const af of readdirSync(metaDir)) {
      if (!af.endsWith(".db.json")) continue;
      const dbinfo = JSON.parse(readFileSync(path.join(metaDir, af), "utf8"));
      this.allfiles[dbinfo.propertiesName] = new DatabaseFile(dbinfo);
    }

    // Quitar los subset: se enumeran solo los que no tienen superset
    const addToAllfiles: Record<string, DatabaseFile> = {};
    this.allfiles_enumerate = {};
    for (const [pr, dbf] of Object.entries(this.allfiles)) {
      const superset = dbf.getSuperProp();
      if (!(superset !== null && this.allfiles[superset] !== undefined)) {
        this.allfiles_enumerate[pr] = dbf;
        if (superset !== null) addToAllfiles[superset] = dbf;
      }
    }
    for (const [pr, dbf] of Object.entries(addToAllfiles)) this.allfiles[pr] = dbf;
  }

  private readOrThrow(filename: string): string {
    const data = readFileSync(filename, "utf8");
    return data;
  }

  private readBookorderFile(filename: string): string[][] {
    const res: string[][] = [];
    for (const line of this.readOrThrow(filename).split("\n")) {
      const buffer = line.trim();
      if (buffer !== "") res.push(buffer.split("/"));
    }
    return res;
  }

  /** init_config(db, pr, language) — elige corpus por propertiesName. */
  initConfig(db: string, pr: string, language: string, dothrow = true): boolean {
    const propname = pr === "" ? db : pr;
    const dbf = this.allfiles[propname];
    if (dbf === undefined) {
      if (dothrow) throw new Error(`Illegal database name: ${propname}`);
      return false;
    }
    this.initConfigDbf(dbf, language);
    return true;
  }

  /** init_config_dbf(dbf, language) — carga todo el estado del corpus. */
  initConfigDbf(dbf: DatabaseFile, language: string): void {
    const dbName = dbf.emdros_db.replace(/^db\//, "");
    if (dbName === "ETCBC4") {
      this.src_lang = ["Hebrew", "Aramaic"];
      this.glosslang = this.glossLangs("heblex");
    } else if (dbName === "nestle1904") {
      this.src_lang = ["greek"];
      this.glosslang = this.glossLangs("greeklex");
    } else if (dbName === "jvulgate") {
      this.src_lang = ["latin"];
      this.glosslang = this.glossLangs("latinlex");
    } else {
      this.src_lang = [];
      this.glosslang = [];
    }

    this.dbinfo_json = this.readOrThrow(path.join(this.metaDir, dbf.dbinfo.replace(/^db\//, "")));
    this.dbinfo = JSON.parse(this.dbinfo_json);
    this.addglossDbinfo();

    // Localización: fila (db, lang) de bol_db_localize, con merge del inglés
    const l2 = this.localize(dbf.propertiesName, language);
    if (l2 === null)
      throw new Error(`Missing localization for ${dbf.propertiesName}/${language}`);
    this.l10n_json = l2;
    if (language !== "en") {
      const eng = this.localize(dbf.propertiesName, "en");
      if (eng === null) throw new Error(`Missing English localization for ${dbf.propertiesName}`);
      const l1 = JSON.parse(eng);
      const l3 = JSON.parse(this.l10n_json);
      this.l10n_json = JSON.stringify(mergeRecursive(l1, l3));
    }
    this.addglossL10nJson(language);

    this.typeinfo_json = this.readOrThrow(path.join(this.metaDir, dbf.typeinfo.replace(/^db\//, "")));
    this.addglossTypeinfoJson();
    this.typeinfo = new TypeInfo(this.typeinfo_json);

    this.bookorder = this.readBookorderFile(path.join(this.metaDir, dbf.bookorder.replace(/^db\//, "")));
    this.emdros_db = dbf.emdros_db;
  }

  /** addgloss_dbinfo: expande featuresetting.gloss a un setting por idioma. */
  private addglossDbinfo(): void {
    const settings = this.dbinfo!.objectSettings as Record<string, unknown>;
    const objHasSurface = this.dbinfo!.objHasSurface as string;
    const osettings = settings?.[objHasSurface] as
      | { featuresetting?: { gloss?: Record<string, unknown> } }
      | undefined;
    const fsetting = osettings?.featuresetting as Record<string, unknown> | undefined;
    if (fsetting?.gloss === undefined) return;

    const srcLang = this.src_lang;
    for (const gl of this.glosslang) {
      const langname = gl.internal;
      const gloss = fsetting.gloss as Record<string, unknown>;
      const clone = structuredClone(gloss) as Record<string, unknown>;
      clone.sql_command = String(gloss.sql_command).replace(/LANG/g, gl.abb);
      clone.sql_command_variant = null;
      // El UI en chino usa la fuente normal; los demás gloses en 10pt
      if (gl.abb !== "zh-Hans" && gl.abb !== "zh-Hant") clone.fontsize = "tenpoint";
      clone.isGloss = true;
      fsetting[langname] = clone;
      void srcLang;
    }
    delete fsetting.gloss;

    // 'GrammarGroupGlosses' → 'GrammarGroup' con features por idioma
    const sgrammar = this.dbinfo!.sentencegrammar as { objType: string; items: unknown[] }[];
    for (const sgo of sgrammar ?? []) {
      if (sgo.objType !== objHasSurface) continue;
      for (const it of sgo.items ?? []) {
        const item = it as { mytype: string; items: unknown[] };
        if (item.mytype === "GrammarGroupGlosses") {
          for (const gl of this.glosslang) {
            item.items.push({ mytype: "GrammarFeature", name: gl.internal });
          }
          item.mytype = "GrammarGroup";
        }
      }
    }
    this.dbinfo_json = JSON.stringify(this.dbinfo);
  }

  /** addgloss_typeinfo_json: features gloss → tipo string en obj2feat. */
  private addglossTypeinfoJson(): void {
    const typinf = JSON.parse(this.typeinfo_json);
    const objHasSurface = this.dbinfo!.objHasSurface as string;
    const osetting = typinf.obj2feat[objHasSurface] as Record<string, string>;
    for (const gl of this.glosslang) osetting[gl.internal] = "string";
    this.typeinfo_json = JSON.stringify(typinf);
  }

  /** addgloss_l10n_json: nombre localizado de cada idioma de gloss. */
  private addglossL10nJson(_language: string): void {
    void _language; // el legacy lo recibe pero no lo usa
    const l10n = JSON.parse(this.l10n_json) as Record<string, unknown>;
    const objHasSurface = this.dbinfo!.objHasSurface as string;
    const wsetting = (l10n.emdrosobject as Record<string, Record<string, unknown>>)[objHasSurface];
    for (const gl of this.glosslang) wsetting[gl.internal] = gl.native;
    this.l10n_json = JSON.stringify(l10n);
  }
}

/** get_*lex_translations: filas de bol_translation_languages por flag. */
export function defaultGlossLangs(kind: "heblex" | "greeklex" | "latinlex"): GlossLang[] {
  const flag = `${kind}_enabled` as const;
  return getAppDb().prepare(`SELECT * FROM bol_translation_languages WHERE ${flag} = 1`).all() as GlossLang[];
}

/**
 * Localización por defecto: bol_db_localize (db, lang), con fallback al
 * archivo `<pr>.<lang>.prop.pretty.json` de data/meta mientras la tabla no
 * esté seedeada (seed-localize).
 */
export function defaultLocalize(metaDir: string): LocalizeGetter {
  return (db: string, lang: string): string | null => {
    const row = getAppDb()
      .prepare("SELECT json FROM bol_db_localize WHERE db = ? AND lang = ?")
      .get(db, lang) as { json: string } | undefined;
    if (row) return row.json;
    try {
      const file = path.join(metaDir, `${db}.${lang}.prop.pretty.json`);
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      return JSON.stringify(parsed);
    } catch {
      return null;
    }
  };
}

/** `array_replace_recursive` de PHP (arrays no asociativos se reemplazan). */
function mergeRecursive(base: unknown, over: unknown): unknown {
  if (Array.isArray(base) || Array.isArray(over)) return over;
  if (typeof base === "object" && base !== null && typeof over === "object" && over !== null) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
      out[k] = k in out ? mergeRecursive(out[k], v) : v;
    }
    return out;
  }
  return over;
}
