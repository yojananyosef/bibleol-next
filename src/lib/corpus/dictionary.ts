/**
 * dictionary.ts — Réplica 1:1 de `libraries/Dictionary.php` de BibleOL.
 *
 * Un Dictionary describe una secuencia de monads (normalmente una frase o
 * capítulo) a nivel jerárquico: nivel 0 = word (SingleMonadObject), niveles
 * superiores = phrase/clause/sentence (MultipleMonadObject), y un objeto
 * artificial "Patriarch" en el último nivel.
 *
 * A diferencia del legacy (que usa $CI global), se inyectan `mql`, `dbinfo`
 * (ya con addgloss aplicado), `l10nJson` y opcionalmente `picdb`.
 */

import type { Mql } from "./mql.ts";
import { OlMonadSet } from "./monads.ts";
import { OlMatchedObject, type OlSheaf } from "./sheaf.ts";
import { MonadObject, SingleMonadObject, MultipleMonadObject } from "./monadobject.ts";
import { IndirectLookup, type IndirectFsetting } from "./lexicon.ts";
import type { Dbinfo, FeatureSetting, GrammarItem, SentenceGrammar } from "./db-config.ts";
import type { Picdb } from "./picdb.ts";

/** Log de INFORMATION() del legacy; por defecto se ignora. */
export type Logger = (message: string) => void;

export interface DictionaryParams {
  msets: OlMonadSet[];
  msets_quiz?: OlMonadSet[] | null;
  inQuiz: boolean;
  showIcons: boolean;
  glosslimit?: number;
}

/** Serialización plana de un MonadObject para el cliente. */
export interface MonadObjectJSON {
  kind: "single" | "multiple";
  id_d: number;
  name: string;
  monads: string;
  features: Record<string, string> | null;
  children_idds: number[] | null;
  /**
   * Solo objetos "multiple": features del primer subobjeto de cada segmento
   * (legacy: `subobjects[mix][0].features`; usado p.ej. para clause_atom:tab).
   */
  subobjects?: Record<string, string>[] | null;
  text?: string;
  suffix?: string;
  bcv?: (string | number)[];
  bcv_loc?: string | null;
  sameAsNext?: boolean[];
  sameAsPrev?: boolean[];
  pics?: (number | string)[] | null;
  urls?: { url: string; type: string }[] | null;
}

export class Dictionary {
  private maxLevels: number;
  sentenceSets: OlMonadSet[];
  sentenceSetsQuiz: OlMonadSet[] | null;
  private singleMonads = new Map<number, SingleMonadObject>();
  private singleMonadsM: Map<number, SingleMonadObject>[] = [];
  monadObjects: MonadObject[][][] = [];
  bookTitle: string | number | null = null;
  private glosslimit: number;
  private indirect = new IndirectLookup();

  private mql: Mql;
  private dbinfo: Dbinfo;
  private l10nJson: string;
  private picdb: Picdb | null;
  private info: Logger;

  constructor(params: DictionaryParams, deps: {
    mql: Mql;
    dbinfo: Dbinfo;
    l10nJson: string;
    picdb?: Picdb | null;
    logger?: Logger;
  }) {
    const msets = params.msets;
    this.sentenceSetsQuiz = params.msets_quiz ?? null;
    const inQuiz = params.inQuiz;
    const showIcons = params.showIcons;
    this.glosslimit = params.glosslimit ?? 0;

    this.mql = deps.mql;
    this.dbinfo = deps.dbinfo;
    this.l10nJson = deps.l10nJson;
    this.picdb = deps.picdb ?? null;
    this.info = deps.logger ?? (() => {});

    const dbinfo = this.dbinfo;

    let number_sets = msets.length;

    this.maxLevels = dbinfo.sentencegrammar.length;
    ++this.maxLevels; // Patriarch

    // En la vista de texto hay que extender los msets a una frase completa
    if (!inQuiz) {
      const emdros_data = this.mql.exec(
        `GET OBJECTS HAVING MONADS IN ${msets[0]} [${dbinfo.sentencegrammar[this.maxLevels - 2].objType} ] GOqxqxqx`,
      );
      const sh = emdros_data[0].get_sheaf() as OlSheaf;

      const mset2 = new OlMonadSet();
      for (const str of sh.get_straws()) {
        for (const mo of str.get_matched_objects()) {
          mset2.addSet(mo.get_monadset());
          if (mset2.size() > 1603) {
            // Reducir los monads a 1603 (longitud de 1 Reyes 8)
            this.info("The size of the passages is too large, it has been reduced");
            break;
          }
        }
      }
      msets.length = 0;
      msets.push(mset2);
      number_sets = 1;
    }

    this.sentenceSets = msets;

    for (let i = 0; i < number_sets; ++i) this.singleMonadsM.push(new Map());
    this.monadObjects = [];
    for (let msetIndex = 0; msetIndex < number_sets; ++msetIndex) {
      const moarr: MonadObject[][] = [];
      for (let i = 0; i < this.maxLevels; ++i) moarr.push([]);
      this.monadObjects.push(moarr);
    }

    const mset_union = new OlMonadSet();
    for (const mset of msets) mset_union.addSet(mset);

    // Un solo comando largo para reducir el arranque del proceso mql
    const command: string[] = [];
    const indirect: Record<string, IndirectFsetting> = {};

    for (const mset of msets) {
      for (let sdiIndex = 0; sdiIndex < this.maxLevels - 1; ++sdiIndex) {
        const sg: SentenceGrammar = dbinfo.sentencegrammar[sdiIndex];

        const subtype = { value: "" };
        const subtypeAllFeat: string[] = [];
        const allFeat = Dictionary.getAllFeaturesString(dbinfo, sdiIndex, subtype, subtypeAllFeat, indirect);
        if (sdiIndex === 0) {
          allFeat.push(dbinfo.surfaceFeature);
          if (dbinfo.suffixFeature !== undefined) allFeat.push(dbinfo.suffixFeature);
        }

        if (subtype.value !== "") {
          command.push(
            `SELECT ALL OBJECTS IN ${mset} WHERE [${sg.objType} ` +
              `${allFeat.length === 0 ? "" : `GET ${allFeat.join(",")}`} ` +
              `[${subtype.value} GET ${subtypeAllFeat.join(",")}]` +
              `] GOqxqxqx`,
          );
        } else {
          command.push(
            `SELECT ALL OBJECTS IN ${mset} WHERE [${sg.objType} ` +
              `${allFeat.length === 0 ? "" : `GET ${allFeat.join(",")}`}` +
              `] GOqxqxqx`,
          );
        }
      }
    }

    if (!inQuiz) {
      for (const uht of dbinfo.universeHierarchy)
        command.push(`GET OBJECTS HAVING MONADS IN ${mset_union} [${uht.type} GET ${uht.feat}] GOqxqxqx`);
    }

    const emdros_data = this.mql.exec(command.join("\n"));
    let mqlresult_index = 0;

    for (let msetIndex = 0; msetIndex < number_sets; ++msetIndex) {
      for (let sdiIndex = 0; sdiIndex < this.maxLevels - 1; ++sdiIndex) {
        const sh = emdros_data[mqlresult_index++].get_sheaf() as OlSheaf;

        for (const str of sh.get_straws()) {
          for (const mo of str.get_matched_objects()) {
            if (sdiIndex === 0) {
              for (const [feat, fsetting] of Object.entries(indirect))
                this.indirectLookup(feat, mo, fsetting, true);
            }
            this.addMonadObject(msetIndex, sdiIndex, mo);
          }
        }
      }
    }

    // Objeto artificial de nivel superior (el patriarch)
    for (let msetIndex = 0; msetIndex < number_sets; ++msetIndex) {
      const mset = msets[msetIndex];
      const mo = new OlMatchedObject(-1, "Patriarch");
      mo.set_monadset(mset);
      this.addMonadObject(msetIndex, this.maxLevels - 1, mo);
    }

    // Información de libro, capítulo y versículo
    const uni_count = dbinfo.universeHierarchy.length;

    if (!inQuiz) {
      for (let unix = 0; unix < uni_count; ++unix) {
        const last_uni_level = unix === uni_count - 1;

        const sh = emdros_data[mqlresult_index++].get_sheaf() as OlSheaf;

        let lastSmo: SingleMonadObject | null = null;

        // El legacy usa get_first_straw() (Emdros agrupa todo en una straw);
        // aquí el motor genera una straw por objeto, así que iteramos todas
        for (const str of sh.get_straws()) {
          for (const mo of str.get_matched_objects()) {
            let featureValue: string | number = mo.get_feature(dbinfo.universeHierarchy[unix].feat) ?? "";
            if (/^-?\d+$/.test(featureValue)) featureValue = parseInt(featureValue, 10);

            let newPoint = true;
            for (const monad of mo.get_monadset()) {
              const smo = this.singleMonads.get(monad);
              if (smo !== undefined) {
                smo.add_bcv(featureValue);
                smo.add_sameAsPrev(!newPoint);
                if (lastSmo !== null) lastSmo.add_sameAsNext(!newPoint);
                lastSmo = smo;
                if (this.bookTitle === null) this.bookTitle = featureValue;
                if (showIcons && last_uni_level && newPoint) {
                  smo.set_pics(this.picdb?.get_pics(smo.get_bcv()) ?? null);
                  smo.set_urls(this.picdb?.get_urls(smo.get_bcv()) ?? null);
                }
                newPoint = false;
              }
            }
          }
        }
        if (lastSmo !== null) lastSmo.add_sameAsNext(false);
      }
    } else {
      // Información bcv del primer monad de cada pregunta del quiz
      const quizCmd: string[] = [];
      for (const question_monads of this.sentenceSetsQuiz!) {
        for (const uht of dbinfo.universeHierarchy)
          quizCmd.push(`GET OBJECTS HAVING MONADS IN {{${question_monads.low()}}} [${uht.type} GET ${uht.feat}] GOqxqxqx`);
      }
      const quizData = this.mql.exec(quizCmd.join("\n"));
      let quizIndex = 0;

      for (let msetIndex = 0; msetIndex < number_sets; ++msetIndex) {
        const question_monads = this.sentenceSetsQuiz![msetIndex];
        for (const uht of dbinfo.universeHierarchy) {
          const sh = quizData[quizIndex++].get_sheaf() as OlSheaf;
          const str = sh.get_first_straw();
          let featureValue: string | number = str.get_first_matched_object().get_feature(uht.feat) ?? "";
          if (/^-?\d+$/.test(featureValue)) featureValue = parseInt(featureValue, 10);

          const smo = this.singleMonadsM[msetIndex].get(question_monads.low());
          smo?.add_bcv(featureValue);
        }
      }
    }

    this.constructHierarchy();
  }

  get_book_title(): string | number | null {
    return this.bookTitle;
  }

  getSentenceSet(): OlMonadSet[] {
    return this.sentenceSets;
  }

  /**
   * Look up a feature outside Emdros (gloss, hint, urls…).
   * Las features de $mo están codificadas con htmlspecialchars.
   */
  public indirectLookup(feat: string, mo: OlMatchedObject, fset: IndirectFsetting, test_glosslimit: boolean): void {
    const value = this.indirect.lookup(feat, mo.features ?? {}, fset, this.glosslimit, test_glosslimit);
    mo.set_feature_raw(feat, String(value));
  }

  /** Nombres de todas las features de un nivel; rellena $indirect. */
  private static getOneLevelFeatureString(
    gl: SentenceGrammar | GrammarItem,
    objType: string,
    all: Set<string>,
    subtype: { value: string },
    subtypeall: Set<string>,
    indirect: Record<string, IndirectFsetting>,
    dbinfo: Dbinfo,
  ): void {
    if (gl.items !== undefined) {
      for (const it of gl.items) {
        this.getOneLevelFeatureString(it, objType, all, subtype, subtypeall, indirect, dbinfo);
      }
    } else if ("name" in gl && gl.name !== undefined) {
      const glName = gl.name;
      if (!glName.includes(":")) {
        const objSettings = dbinfo.objectSettings;
        const setting = (objSettings[objType] as { featuresetting?: Record<string, FeatureSetting> } | undefined)
          ?.featuresetting?.[glName];
        if (setting?.sqlargs !== undefined) {
          indirect[glName] = setting as IndirectFsetting;
          for (const n of setting.sqlargs) all.add(n);
        } else {
          all.add(glName);
        }
      } else {
        const [subt, name] = glName.split(":");
        subtype.value = subt;
        const namecomponents = name.split("_TYPE_");
        subtypeall.add(namecomponents[0]);
      }
    }
  }

  private static getAllFeaturesString(
    dbinfo: Dbinfo,
    grammarListIx: number,
    subtype: { value: string },
    subtypeall: string[],
    indirect: Record<string, IndirectFsetting>,
  ): string[] {
    const all = new Set<string>();
    subtype.value = "";
    const subtypeAllSet = new Set<string>();
    this.getOneLevelFeatureString(
      dbinfo.sentencegrammar[grammarListIx],
      dbinfo.sentencegrammar[grammarListIx].objType,
      all,
      subtype,
      subtypeAllSet,
      indirect,
      dbinfo,
    );
    subtypeall.push(...subtypeAllSet);
    return [...all];
  }

  private addMonadObject(msetIndex: number, level: number, matob: OlMatchedObject): void {
    if (level === 0) {
      const thisMo = new SingleMonadObject(matob, this.dbinfo, this.l10nJson);
      this.monadObjects[msetIndex][0].push(thisMo);

      const monad = thisMo.get_mo().get_monadset().getSingleInteger();
      this.singleMonads.set(monad, thisMo);
      this.singleMonadsM[msetIndex].set(monad, thisMo);
    } else {
      const mmo = new MultipleMonadObject(matob);
      this.monadObjects[msetIndex][level].push(mmo);
    }
  }

  /** Enlaza padre-hijo una vez creados todos los MonadObject. */
  private constructHierarchy(): void {
    let dummyidd = 10000000;

    for (let msetIndex = 0; msetIndex < this.sentenceSets.length; ++msetIndex) {
      const moarr = this.monadObjects[msetIndex];
      for (let i = 1; i < this.maxLevels; ++i) {
        for (const parentMo of moarr[i]) {
          for (const childMo of moarr[i - 1]) {
            if (childMo.contained_in(parentMo)) parentMo.add_child(childMo);
          }
        }

        // Objetos sin padre: se crea un dummy en el nivel superior
        for (const childMo of moarr[i - 1]) {
          if (childMo.get_parent() === null) {
            const matobj = new OlMatchedObject(dummyidd++, "dummy");
            matobj.set_monadset(childMo.get_mo().get_monadset());

            const mmo = new MultipleMonadObject(matobj);
            moarr[i].push(mmo);
            mmo.add_child(childMo);
          }
        }
      }
    }
  }

  /** Texto a mostrar para un monad dado. */
  getVisual(monad: number): string {
    const smo = this.singleMonads.get(monad);
    return (smo?.get_text() ?? "") + (smo?.get_suffix() ?? "");
  }

  /** Serialización para el cliente (las features van HTML-encoded, como en el legacy). */
  toJSON(): {
    bookTitle: string | number | null;
    sentenceSets: string[];
    sentenceSetsQuiz: string[] | null;
    monadObjects: { level: number; objects: MonadObjectJSON[] }[][];
  } {
    // monadObjects[índice de conjunto de frases][nivel] — como el legacy
    // (Dictionary.php: monadObjects[$msetIndex][$level][]).
    const sets: { level: number; objects: MonadObjectJSON[] }[][] = [];
    for (let setIndex = 0; setIndex < this.sentenceSets.length; ++setIndex) {
      const levels: { level: number; objects: MonadObjectJSON[] }[] = [];
      for (let level = 0; level < this.maxLevels; ++level) {
        const objects = this.monadObjects[setIndex][level].map((mo) => this.serializeMonadObject(mo));
        levels.push({ level, objects });
      }
      sets.push(levels);
    }
    return {
      bookTitle: this.bookTitle,
      sentenceSets: this.sentenceSets.map((ms) => ms.toString()),
      sentenceSetsQuiz: this.sentenceSetsQuiz?.map((ms) => ms.toString()) ?? null,
      monadObjects: sets,
    };
  }

  private serializeMonadObject(mo: MonadObject): MonadObjectJSON {
    const base: MonadObjectJSON = {
      kind: mo instanceof SingleMonadObject ? "single" : "multiple",
      id_d: mo.get_id_d(),
      name: mo.get_mo().name,
      monads: mo.get_monadset().toString(),
      features: mo.get_mo().get_features(),
      children_idds: mo.children_idds,
    };
    if (mo instanceof MultipleMonadObject) {
      // El legacy usa subobjects[mix][0].features (el primer subobjeto de cada
      // segmento) para las features de subobjeto (p.ej. clause_atom:tab).
      base.subobjects = (mo.subobjects ?? []).map((seg) => seg[0]?.get_features() ?? {});
    }
    if (mo instanceof SingleMonadObject) {
      base.text = mo.text;
      base.suffix = mo.suffix;
      base.bcv = mo.bcv;
      base.bcv_loc = mo.bcv_loc;
      base.sameAsNext = mo.sameAsNext;
      base.sameAsPrev = mo.sameAsPrev;
      base.pics = mo.pics;
      base.urls = mo.urls;
    }
    return base;
  }
}
