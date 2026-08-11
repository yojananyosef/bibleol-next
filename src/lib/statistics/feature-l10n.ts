/**
 * feature-l10n.ts — Db_config::init_config + stripSortIndex del legacy para
 * localizar nombres de features y valores de enumeraciones en las vistas
 * de estadísticas (view_statistics / student_exercise / grades).
 */
import { DbConfig } from "../corpus/db-config";

export interface FeatureL10n {
  /** l10n.emdrosobject[qoname][feature] = label del feature. */
  l10n: {
    emdrosobject?: Record<string, Record<string, string>>;
    emdrostype?: Record<string, Record<string, string>>;
  };
  /** typeinfo.obj2feat (feature → tipo) */
  obj2feat: Record<string, Record<string, string>>;
}

const dbConfig = new DbConfig();

/**
 * Carga la localización del corpus del template (init_config(db, pr, lang)).
 * null si el corpus no existe (el legacy hace `continue` en show_stat).
 */
export function loadFeatureL10n(
  dbname: string,
  dbpropname: string,
  qoname: string,
  language: string,
): FeatureL10n | null {
  try {
    if (!dbConfig.initConfig(dbname, dbpropname, language, false)) return null;
    const l10n = JSON.parse(dbConfig.l10n_json) as FeatureL10n["l10n"];
    return { l10n, obj2feat: dbConfig.typeinfo?.obj2feat ?? {} };
  } catch {
    return null;
  }
}

/** stripSortIndex($s) — quita "# " inicial de los valores de enumeración. */
export function stripSortIndex(s: string): string {
  return s.length > 0 && s[0] === "#" ? s.slice(s.indexOf(" ") + 1) : s;
}

/**
 * Localiza el valor de una feature (emdrostype), incluyendo tipos
 * "list of …" (valores "(a,b,c)" → "a, b, c" localizados).
 */
export function localizeValue(
  l10n: FeatureL10n["l10n"],
  obj2feat: FeatureL10n["obj2feat"],
  qoname: string,
  feature: string,
  value: string,
): string {
  const featureType = obj2feat[qoname]?.[feature] ?? "string";
  const emdrostype = l10n.emdrostype ?? {};

  if (featureType.startsWith("list of ")) {
    const subFeatureType = featureType.slice(8);
    if (value.length === 0 || value[0] !== "(" || value[value.length - 1] !== ")") return value;
    const parts = value.slice(1, -1).split(",");
    return parts
      .map((rfv) =>
        emdrostype[subFeatureType]?.[rfv] !== undefined
          ? stripSortIndex(emdrostype[subFeatureType][rfv])
          : rfv,
      )
      .join(", ");
  }
  if (emdrostype[featureType]?.[value] !== undefined)
    return stripSortIndex(emdrostype[featureType][value]);
  return value;
}
