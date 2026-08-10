// -*- js -*-
// configuration.ts — port de BibleOL/ts/configuration.ts (puro, sin DOM).
// Los datos (dbinfo/typeinfo) se inyectan con init().

/** UHTriple: nivel de la jerarquía del universo. */
export interface UHTriple {
  type: string;
  feat: string;
}

export interface ObjectSetting {
  mayselect?: boolean;
  additionalfeatures?: string;
  featuresetting?: { [featurename: string]: FeatureSetting };
}

export interface FeatureSetting {
  hideWord?: boolean;
  foreignText?: boolean;
  transliteratedText?: boolean;
  ignoreSelect?: boolean;
  ignoreShow?: boolean;
  ignoreRequest?: boolean;
  isDefault?: boolean;
  matchregexp?: string;
  isRange?: boolean;
  hideValues?: string[];
  otherValues?: string[];
  alternateshowrequestDb?: string;
  alternateshowrequestSql?: string;
  indirdb?: string;
  sql_command?: string;
  sqlargs?: string[];
  multiple?: boolean;
  isGloss?: boolean;
  alternateshowrequestFeat?: string;
}

export interface Configuration {
  version: number;
  databaseName: string;
  propertiesName: string;
  charSet: string;
  databaseVersion: string;
  granuarity: string;
  surfaceFeature: string;
  objHasSurface: string;
  suffixFeature: string;
  useSofPasuq: boolean;
  objectSettings: { [objectname: string]: ObjectSetting };
  universeHierarchy: UHTriple[];
  picDb: string;
  sentencegrammar: unknown[]; // SentenceGrammar[] (reader/sentencegrammar.ts)
  maxLevels?: number;
}

export interface TypeInfo {
  objTypes: string[];
  obj2feat: { [objType: string]: FeatureMap };
  enumTypes: string[];
  enum2values: { [enumname: string]: string[] };
}

export interface FeatureMap {
  [featName: string]: string;
}

let configuration: Configuration | null = null;
let typeinfo: TypeInfo | null = null;

export function initConfiguration(cfg: Configuration, ti: TypeInfo): void {
  configuration = cfg;
  typeinfo = ti;
}

export function getConfiguration(): Configuration {
  if (!configuration) throw new Error("legacy-ts: configuration not initialized");
  return configuration;
}

export function getTypeInfo(): TypeInfo {
  if (!typeinfo) throw new Error("legacy-ts: typeinfo not initialized");
  return typeinfo;
}

export function getObjectSetting(otype: string): ObjectSetting {
  return getConfiguration().objectSettings[otype];
}

export function getFeatureSetting(otype: string, feature: string): FeatureSetting {
  let ot = otype;
  let f = feature;

  // Pseudo-feature 'visual'
  if (f === "visual") {
    ot = getConfiguration().objHasSurface;
    f = getConfiguration().surfaceFeature;
  }

  // Quita la especificación de formato si está presente
  const io = f.indexOf("_TYPE_");
  if (io !== -1) f = f.substring(0, io);

  return getObjectSetting(ot).featuresetting?.[f] ?? {};
}
