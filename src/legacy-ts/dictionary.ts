// -*- js -*-
// dictionary.ts — port de BibleOL/ts/dictionary.ts (puro, sin jQuery ni DOM).
//
// Interpreta la variable 'dictionaries' generada por el servidor (showQuiz /
// quiz_rand) y construye la jerarquía de visualización
// (DisplayMonadObject). La generación de HTML es una string (no DOM); el
// texto de la frase se acumula en sentenceTextArr[0] para las estadísticas.

import { WHAT } from "../lib/reader/sentencegrammar.ts";
import type { SentenceGrammarItem } from "../lib/reader/sentencegrammar.ts";
import { localize, getObjectFriendlyName } from "./localization.ts";
import { getConfiguration, getFeatureSetting } from "./configuration.ts";
import type { FeatureSetting } from "./configuration.ts";
import { mayShowFeature } from "./quizdata.ts";
import type { QuizData } from "./quizdata.ts";
import type {
  MonadObject,
  SingleMonadObject,
  MultipleMonadObject,
  MonadSet,
  MonadPair,
} from "./monadobject.ts";
import { getSingleInteger, parseMonadSet } from "./monadobject.ts";
import { DisplaySingleMonadObject, DisplayMultipleMonadObject } from "./displaymonadobject.ts";
import type { DisplayMonadObject, DisplayCtx } from "./displaymonadobject.ts";
import { toReaderL10n, toReaderTypeInfo, asFeatureMap } from "./displaymonadobject.ts";

/** La variable 'dictionaries' del servidor. */
export interface DictionaryIf {
  sentenceSets: MonadSet[];
  sentenceSetsQuiz: MonadSet[];
  monadObjects: MonadObject[][][]; // First index is sentence set number, second index is level (word, phrase, clause etc.), third index gives the actual object
  bookTitle: string;
}

/** Formato del servidor (dictionaries_json de showQuiz). */
export interface ServerDictionaryIf {
  bookTitle: string | number | null;
  sentenceSets: string[];
  sentenceSetsQuiz: string[] | null;
  monadObjects: { level: number; objects: ServerMonadObject[] }[][];
}

/** Formato de un objeto del servidor (MonadObjectJSON del corpus). */
export interface ServerMonadObject {
  kind: "single" | "multiple";
  id_d: number;
  name: string;
  monads: string;
  features: Record<string, string> | null;
  children_idds: number[] | null;
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

/** Convierte un MonadObject del servidor al formato interno del legacy. */
export function serverMonadToLegacy(o: ServerMonadObject): MonadObject {
  const base = {
    mo: {
      id_d: o.id_d,
      name: o.name,
      monadset: parseMonadSet(o.monads),
      features: o.features ?? {},
      sheaf: undefined,
    },
    children_idds: o.children_idds ?? [],
  };
  if (o.kind === "single") {
    const smo = base as SingleMonadObject;
    smo.text = o.text ?? "";
    smo.suffix = o.suffix ?? "";
    smo.bcv = (o.bcv ?? []) as string[];
    smo.bcv_loc = o.bcv_loc ?? "";
    smo.sameAsNext = o.sameAsNext ?? [];
    smo.sameAsPrev = o.sameAsPrev ?? [];
    smo.pics = (o.pics ?? []) as number[];
    smo.urls = (o.urls ?? []).map((u) => [u.url, u.type]);
    return smo;
  }
  return base as MultipleMonadObject;
}

/** Convierte el dictionaries del servidor al formato DictionaryIf del cliente. */
export function serverDictionaryToLegacy(d: ServerDictionaryIf): DictionaryIf {
  // monadObjects[índice de conjunto de frases][nivel][objeto] — el servidor
  // envía un conjunto de frases por pregunta (como el legacy: un único
  // Dictionary con varios sentenceSets).
  const monadObjects: MonadObject[][][] = [];
  for (const levels of d.monadObjects) {
    const set: MonadObject[][] = [];
    for (const { level, objects } of levels) set[level] = objects.map(serverMonadToLegacy);
    monadObjects.push(set);
  }
  return {
    sentenceSets: d.sentenceSets.map(parseMonadSet),
    sentenceSetsQuiz: (d.sentenceSetsQuiz ?? d.sentenceSets).map(parseMonadSet),
    monadObjects,
    bookTitle: String(d.bookTitle ?? ""),
  };
}

/**
 * Dictionary: interpreta una entrada de 'dictionaries' y genera el HTML
 * correspondiente.
 */
export class Dictionary {
  // The fields sentenceSet, monadobjects1 and bookTitle contain data extracted from the dictionaries variable.
  public sentenceSet: MonadSet; // A single MonadSet from dictionaries.sentenceSets
  public sentenceSetQuiz: MonadSet; // A single MonadSet from dictionaries.sentenceSetsQuiz
  public monadObjects1: MonadObject[][]; // A single 2-D array from dictionaries.monadObjects.
  public bookTitle: string; // Identical to dictionaries.bookTitle

  public monads: MonadObject[] = []; // Maps id_d => monad object
  public level: number[] = []; // Maps id_d => object level
  private singleMonads: SingleMonadObject[] = []; // Maps monad number => SingleMonadObject (words only)
  public dispMonadObjects: DisplayMonadObject[][] = []; // The Emdros objects to display.
  // The first index is level (word, phrase, clause etc.), the second index gives the actual object

  private hideWord: boolean; // Should the question object be replaced by numbers in the text?

  private ctx: DisplayCtx;

  /**
   * @param dictif The DictionaryIf object to interpret.
   * @param index  The entry in dictif.sentenceSets and dictif.monadObjects to interpret.
   * @param qd     Quiz information if we are generating an exercise, otherwise null.
   * @param ctx    Contexto de visualización (l10n/typeinfo/charset del quiz).
   */
  constructor(dictif: DictionaryIf, index: number, qd: QuizData | null, ctx: DisplayCtx) {
    this.ctx = ctx;

    // Save local copy of relevant information
    this.sentenceSet = dictif.sentenceSets[index];
    this.sentenceSetQuiz = dictif.sentenceSetsQuiz == null ? this.sentenceSet : dictif.sentenceSetsQuiz[index];
    this.monadObjects1 = dictif.monadObjects[index];
    this.bookTitle = dictif.bookTitle;
    this.hideWord = qd != null && qd.quizFeatures.hideWord;

    const maxLevels = getConfiguration().maxLevels ?? 1;

    // Generate the 'singleMonads', 'monads' and 'level' maps.
    for (let level = 0; level < this.monadObjects1.length; ++level) {
      // leveli is 0 for word, 1 for phrase, etc. (or something similar depending on the database)
      for (let i = 0; i < this.monadObjects1[level].length; ++i) {
        const item: MonadObject = this.monadObjects1[level][i]; // A single Emdros object
        if (level === 0) this.singleMonads[getSingleInteger(item.mo.monadset)] = item as SingleMonadObject;
        this.monads[item.mo.id_d] = item;
        this.level[item.mo.id_d] = level;
      }
    }

    // Bind parents and children of the MonadObject hierarchy
    for (let i = 0; i < this.monads.length; ++i) {
      if (this.monads[i] === undefined) continue; // Sparse array
      const parent: MonadObject = this.monads[i];
      for (let i2 = 0; i2 < parent.children_idds.length; ++i2) {
        const child_idd: number = parent.children_idds[i2];
        this.monads[child_idd].parent = parent;
      }
    }

    ///////////////////////////
    // Create display hierarchy

    // Single monads (i.e. words)
    this.dispMonadObjects.push([]);

    for (const se of Object.keys(this.singleMonads)) {
      // singleMonads is sparsely populated
      this.dispMonadObjects[0].push(
        new DisplaySingleMonadObject(
          this.singleMonads[+se],
          ctx.sentencegrammar[0].objType,
          qd != null,
        ),
      );
    }

    // Multiple monads (i.e. phrases, clauses, etc.)
    for (let lev = 1; lev < maxLevels; ++lev) {
      const ldmo: DisplayMonadObject[] = []; // The Emdros objects at level 'lev'

      this.dispMonadObjects.push(ldmo);

      if (lev < maxLevels - 1) {
        // Not top level
        for (let i = 0; i < (this.monadObjects1[lev] ?? []).length; ++i) {
          const monadObject: MonadObject = this.monadObjects1[lev][i]; // The current object

          // Split object into contiguous segments
          const segCount: number = monadObject.mo.monadset.segments.length;

          for (let mix = 0; mix < segCount; ++mix) {
            const mp: MonadPair = monadObject.mo.monadset.segments[mix];
            ldmo.push(
              new DisplayMultipleMonadObject(
                monadObject as MultipleMonadObject,
                ctx.sentencegrammar[lev].objType,
                lev,
                mp,
                mix,
                mix > 0,
                mix < segCount - 1,
              ),
            );
          }
        }

        // Sort ldmo in monad order
        ldmo.sort((a, b) => a.range.low - b.range.low);
      } else {
        // Top level
        // At the top level there is always only one DisplayMultipleMonadObject
        const monadObject: MonadObject = this.monadObjects1[lev][0];
        ldmo.push(
          new DisplayMultipleMonadObject(
            monadObject as MultipleMonadObject,
            "Patriarch", // The pseudo-name of the top-level object
            lev,
            monadObject.mo.monadset,
          ),
        );
      }
    }

    /////////////////////////////////////////////////////////
    // Construct child-parent linkage for DisplayMonadObjects

    for (let lev = 1; lev < maxLevels; ++lev) {
      // Find constituent MonadObjects

      // Loop through monads at level lev
      for (let parentDmoIx = 0; parentDmoIx < this.dispMonadObjects[lev].length; ++parentDmoIx) {
        const parentDmo: DisplayMonadObject = this.dispMonadObjects[lev][parentDmoIx];

        // Loop through monads at child level
        for (let childDmoIx = 0; childDmoIx < this.dispMonadObjects[lev - 1].length; ++childDmoIx) {
          const childDmo: DisplayMonadObject = this.dispMonadObjects[lev - 1][childDmoIx];
          if (childDmo.containedIn(parentDmo)) {
            // We found a child
            if (childDmo.parent !== undefined) throw "BAD1"; // Ensures that the tree is properly constructed
            childDmo.parent = parentDmo as DisplayMultipleMonadObject;
            parentDmo.children.push(childDmo);
          }
        }
      }
    }
  }

  /**
   * Generates HTML code to display the current text. The text is also stored
   * in sentenceTextArr[0], used for exercise statistics.
   *
   * @param qd Data for the current exercise. Null, if we are not generating an exercise.
   */
  public generateSentenceHtml(qd: QuizData | null): string {
    DisplaySingleMonadObject.itemIndex = 0; // Used in exercises where numbers replace text

    const sentenceTextArr: string[] = [""]; // The text is built in element [0] of this array

    // Call DisplayMonadObject.generateHtml() on the top-most Emdros object (the 'Patriarch')
    let html = this.dispMonadObjects[this.dispMonadObjects.length - 1][0].generateHtml(
      qd,
      sentenceTextArr,
      this.sentenceSetQuiz,
      this.ctx,
    );

    if (getConfiguration().databaseName === "ETCBC4") {
      // Generate indentation information: the <span class="xgrammar clause_atom_tab
      // indentation" data-indent="N"> elements get their content from the min/max indent.
      const indents = [...html.matchAll(/data-indent="(\d+)"/g)].map((m) => +m[1]);
      if (indents.length > 0) {
        const minindent = Math.min(...indents);
        const maxindent = Math.max(...indents);
        html = html.replace(/<span class="xgrammar clause_atom_tab dontshowit indentation" data-indent="(\d+)">/g, (_, n: string) =>
          `<span class="xgrammar clause_atom_tab dontshowit indentation" data-indent="${n}">${indentationIndicator(+n, minindent, maxindent)}&nbsp;&nbsp;</span>`,
        );
      }
    }

    return sentenceTextArr[0];
  }

  /**
   * Generates HTML for the grammar information box (equivalent a toolTipFunc).
   *
   * @param idd      The Emdros id_d of the object.
   * @param mix      The part of a multi-part object (such as a split clause).
   * @param set_head True if a header line should be generated (hover); false para el click.
   * @returns A tuple of two strings: the HTML contents and the heading.
   */
  public toolTipFunc(idd: number, mix: number, set_head: boolean): [string, string] {
    const monob: MonadObject = this.monads[idd]; // Current MonadObject
    const level: number = this.level[idd]; // Current level (0=word, 1=phrase, etc.)
    const sengram = this.ctx.sentencegrammar[level]; // Sentence grammar information for the current level
    const res: string[] = ["<table>"]; // Will contain the resulting HTML

    if (set_head) {
      res.push(
        `<tr>
                        <td colspan="2" class="tooltiphead">${getObjectFriendlyName(sengram.objType)}</td>
                    </tr>`,
      );
    }

    if (level === 0 && !this.hideWord) {
      // Word level and we're not hiding the text
      res.push(
        `<tr>
                        <td>${localize("visual")}</td>
                        <td class="bol-tooltip leftalign ${this.ctx.charset.foreignClass}">${String(monob.mo.features[this.ctx.surfaceFeature])}</td>
                    </tr>`,
      );
    }

    const map: { [key: string]: string } = {}; // Maps feature name => localized feature name

    // Populate 'map':
    sengram.walkFeatureNames(
      sengram.objType,
      toReaderL10n(this.ctx.l10n),
      (whattype, objType, origObjType, featName, featNameLoc) => {
        if ((whattype === WHAT.feature || whattype === WHAT.metafeature) && !mayShowFeature(objType, origObjType, featName, sengram as unknown as SentenceGrammarItem))
          return;

        if (whattype === WHAT.feature || whattype === WHAT.metafeature || whattype === WHAT.groupstart)
          map[featName] = featNameLoc ?? featName;
      },
    );

    // Generate HTML for each feature of the object
    sengram.walkFeatureValues(
      asFeatureMap(monob.mo.features),
      mix,
      sengram.objType,
      false,
      toReaderL10n(this.ctx.l10n),
      toReaderTypeInfo(this.ctx.typeinfo),
      (whattype, objType, origObjType, featName, featValLoc, sgiObj) => {
        switch (whattype) {
          case WHAT.feature:
            if (mayShowFeature(objType, origObjType, featName, sgiObj)) {
              let wordclass: string; // HTML element class for displaying current feature value
              const fs: FeatureSetting = getFeatureSetting(objType, featName);
              if (featValLoc === "-") wordclass = "";
              else if (fs.foreignText) wordclass = this.ctx.charset.foreignClass;
              else if (fs.transliteratedText) wordclass = this.ctx.charset.transliteratedClass ?? "";
              else wordclass = "";
              res.push(
                `<tr>
                            <td>${map[featName]}</td>
                            <td class="bol-tooltip leftalign ${wordclass}">${featValLoc}</td>
                        </tr>`,
              );
            }
            break;

          case WHAT.metafeature:
            if (mayShowFeature(objType, origObjType, featName, sgiObj)) {
              res.push(
                `<tr>
                            <td>${map[featName]}</td>
                            <td class="bol-tooltip leftalign">${featValLoc}</td>
                        </tr>`,
              );
            }
            break;

          case WHAT.groupstart:
            res.push(
              `<tr>
                        <td><b>${map[featName]}:</b></td>
                        <td class="leftalign"></td>
                    </tr>`,
            );
            break;
        }
      },
    );

    return [res.join("") + "</table>", getObjectFriendlyName(sengram.objType)];
  }

  /**
   * Returns the SingleMonadObject (i.e. word) identified by a monad.
   *
   * @param monad The monad identifying the Emdros word object.
   */
  public getSingleMonadObject(monad: number): SingleMonadObject {
    return this.singleMonads[monad];
  }
}

/** Dictionary.boxes (dictionary.ts): indicador "N▪▪▪" para la sangría hebrea. */
export function indentationIndicator(num: number, minnum: number, maxnum: number): string {
  let s = "";
  const numspaces = num < 10 ? num : num - 1; // If num has two digits, we write one space less

  for (let i = minnum; i < numspaces; ++i) s += "\u00a0"; // Unicode NO-BREAK SPACE

  s += num;

  for (let i = num; i <= maxnum; ++i) s += "\u25aa"; // Unicode BLACK SMALL SQUARE

  return s;
}
