// -*- js -*-
// displaymonadobject.ts — port de BibleOL/ts/displaymonadobject.ts (puro, sin
// jQuery). generateHtml() devuelve la string HTML equivalente al elemento
// jQuery del legacy; el texto de la frase se acumula en sentenceTextArr[0].

import { WHAT } from "../lib/reader/sentencegrammar.ts";
import type { ReaderL10n, ReaderTypeInfo, SentenceGrammar } from "../lib/reader/sentencegrammar.ts";
import type { Charset } from "../lib/reader/charset.ts";
import type { Localization } from "./localization.ts";
import { localize, getObjectFriendlyName, getObjectShortFriendlyName } from "./localization.ts";
import type { TypeInfo } from "./configuration.ts";
import { getConfiguration } from "./configuration.ts";
import type { FeatureSetting } from "./configuration.ts";
import { getFeatureSetting } from "./configuration.ts";
import type { QuizData } from "./quizdata.ts";
import type { MonadObject, SingleMonadObject, MultipleMonadObject, MonadSet, MonadPair } from "./monadobject.ts";
import { containsMonad } from "./monadobject.ts";

/** Maps URL type to non-localized hyperlink title. */
const urlTypeString: { [code: string]: string } = {
  u: "click_for_web_site",
  v: "click_for_video",
  d: "click_for_document",
};

export abstract class DisplayMonadObject {
  protected displayedMo: MonadObject; // The MonadObject being displayed (perhaps in part) by this DisplayMonadObject
  protected objType: string; // The name of the Emdros object type represented by this object
  protected level: number; // The level of this object. (0 for a DisplaySingleMonadObject, >0 for a DisplayMultipleMonadObject)
  public range!: MonadPair; // The (single range) monad set being displayed by this object
  protected mix!: number; // The index in the monad set ranges that make up this object
  public parent?: DisplayMultipleMonadObject; // The parent of this Emdros object
  public children: DisplayMonadObject[] = []; // The children of this Emdros object

  constructor(mo: MonadObject, objType: string, level: number) {
    this.displayedMo = mo;
    if (mo.displayers === undefined) mo.displayers = [this];
    else mo.displayers.push(this);
    this.objType = objType;
    this.level = level;
  }

  /**
   * Generates the HTML that displays the Emdros object.
   *
   * @param qd              Data for the current exercise. Null, if we are not generating an exercise.
   * @param sentenceTextArr The generated HTML is stored in element 0 of this array.
   * @param quizMonads      The monads of the current question.
   * @param ctx             El contexto del display (l10n, typeinfo, charset).
   */
  public abstract generateHtml(
    qd: QuizData | null,
    sentenceTextArr: string[],
    quizMonads: MonadSet,
    ctx: DisplayCtx,
  ): string;

  /** Determines if this object is a subset of another DisplayMonadObject. */
  public containedIn(mo: DisplayMonadObject): boolean {
    return this.range.low >= mo.range.low && this.range.high <= mo.range.high;
  }
}

/** Contexto compartido por la generación de HTML (evita imports circulares). */
export interface DisplayCtx {
  l10n: Localization;
  typeinfo: TypeInfo;
  charset: Charset;
  sentencegrammar: SentenceGrammar[];
  siteUrl: string;
  surfaceFeature: string;
  suffixFeature: string;
}

export class DisplaySingleMonadObject extends DisplayMonadObject {
  private inQuiz: boolean; // True if we are displaying an exercise
  public static itemIndex = 0; // The number replacing a word in the displayed text of some exercises
  private monad: number; // The Emdros monad of this object

  constructor(smo: SingleMonadObject, objType: string, inQuiz: boolean) {
    super(smo, objType, 0);
    this.inQuiz = inQuiz;
    this.monad = smo.mo.monadset.segments[0].low;
    this.range = { low: this.monad, high: this.monad };
    this.mix = 0;
  }

  public generateHtml(
    qd: QuizData | null,
    sentenceTextArr: string[],
    quizMonads: MonadSet,
    ctx: DisplayCtx,
  ): string {
    const smo = this.displayedMo as SingleMonadObject; // The SingleMonadObject being displayed by this DisplaySingleMonadObject

    const uhSize = smo.bcv.length; // The size of the hierarchy book/chapter/verse. This is currently always 3
    let verse: string | null = null; // Current verse, set if the current word is the first word of a verse

    // For displaying link icons (only set on the first word in a verse):
    let refs: number[] | null = null; // Any picture database references associated with the current verse
    let urls: string[][] | null = null; // Any URLs associated with the current verse

    if (uhSize !== 0 && !this.inQuiz) {
      for (let i = 0; i < uhSize; ++i) {
        if (!smo.sameAsPrev[i]) {
          if (i === 1) {
            // Chapter set but not displayed in the current quiz port
          } else if (i === 2) {
            verse = smo.bcv[i];
            refs = smo.pics;
            urls = smo.urls;
          }
        }
      }
    }

    let text: string; // The text to display for the current word
    let textDisplayClass = ""; // HTML element class for text
    if (qd && qd.monad2Id[this.monad] && containsMonad(quizMonads, this.monad)) {
      // This is a quiz object
      if (qd.quizFeatures.hideWord) text = `(${++DisplaySingleMonadObject.itemIndex})`;
      else text = String(this.displayedMo.mo.features[ctx.surfaceFeature]);
      // <em>..</em> are added in order to mark the question object in statistics, but do not
      // affect how the word is displayed.
      text = `<em>${text}</em>`;
      textDisplayClass = " text-danger"; // (Red text) Indicates question object
    } else {
      text = String(this.displayedMo.mo.features[ctx.surfaceFeature]);
      if (!containsMonad(quizMonads, this.monad)) textDisplayClass = " text-muted";
    }

    // Representation of chapter and verse number:
    const versestring = verse === null ? "" : `<span class="verse">${verse}</span>`;

    let refstring: string; // String of icons representing pictures
    if (refs === null) refstring = "";
    else if (refs.length === 4) // Only one reference
      refstring = `<a target="_blank" title="${localize("click_for_picture")}" href="https://resources.learner.bible/link.php?picno=${refs[3]}"><img src="${ctx.siteUrl}images/p.png"></a>`;
    else // More than one reference
      refstring = `<a target="_blank" title="${localize("click_for_pictures")}" href="https://resources.learner.bible/img.php?book=${refs[0]}&chapter=${refs[1]}&verse=${refs[2]}"><img src="${ctx.siteUrl}images/pblue.png"></a>`;

    let urlstring = ""; // String of icons representing URLs
    if (urls !== null)
      for (let uix = 0; uix < urls.length; ++uix)
        urlstring += `<a target="_blank" title="${localize(urlTypeString[urls[uix][1]])}" href="${urls[uix][0]}"><img src="${ctx.siteUrl}images/${urls[uix][1]}.png"></a>`;

    let grammar = ""; // Will hold the interlinear grammar information
    ctx.sentencegrammar[0].walkFeatureValues(
      asFeatureMap(smo.mo.features),
      0,
      this.objType,
      false,
      toReaderL10n(ctx.l10n),
      toReaderTypeInfo(ctx.typeinfo),
      (whattype, objType, _origObjType, featName, featValLoc) => {
        switch (whattype) {
          case WHAT.feature: {
            let wordclass: string; // The class attribute of an HTML element
            const fs: FeatureSetting = getFeatureSetting(objType, featName);
            if (fs.foreignText) wordclass = ctx.charset.foreignClass;
            else if (fs.transliteratedText) wordclass = ctx.charset.transliteratedClass ?? "";
            else if (fs.isGloss && featName !== "zh-Hans" && featName !== "zh-Hant") wordclass = "tenpoint ltr";
            else wordclass = "ltr";

            // For certain databases and translations, show only the first gloss
            let fvl = featValLoc;
            if (
              (getConfiguration().databaseName === "ETCBC4" && fs.isGloss) ||
              (getConfiguration().databaseName === "nestle1904" &&
                (featName === "swahili" || featName === "danish" || featName === "portuguese")) ||
              ((getConfiguration().databaseName === "jvulgate" || getConfiguration().databaseName === "VC") &&
                (featName === "swahili" || featName === "danish"))
            ) {
              fvl = fvl.replace(/(&[gl]t);/, "$1Q") // Remove ';' from "&gt;" and "&lt;"
                .replace(/([^,;(]+).*/, "$1") // Remove everything after ',' or ';' or '('
                .replace(/(&[gl]t)Q/, "$1;"); // Reinsert ';' in "&gt;" and "&lt;"
            }

            grammar += `<span class="wordgrammar dontshowit ${featName} ${wordclass}">${fvl}</span>`;
            break;
          }

          case WHAT.metafeature:
            grammar += `<span class="wordgrammar dontshowit ${featName} ltr">${featValLoc}</span>`;
            break;
        }
      },
    );

    let followSpace = '<span class="wordspace"> </span>'; // Enables line wrapping

    if (ctx.suffixFeature) {
      const suffix = String(smo.mo.features[ctx.suffixFeature]);
      text += suffix;
      if (suffix === "" || suffix === "-" || suffix === "\u05be" /* maqaf */) {
        followSpace = ""; // Prevents line wrapping
        textDisplayClass += suffix === "" ? " cont cont1" : " contx cont1";
        sentenceTextArr[0] += text;
      } else sentenceTextArr[0] += text + " ";
    } else sentenceTextArr[0] += text + " ";

    return `<span class="textblock inline"><span class="textdisplay ${ctx.charset.foreignClass + textDisplayClass}" data-idd="${smo.mo.id_d}">${versestring}${refstring}${urlstring}${text}</span>${grammar}</span>${followSpace}`;
  }
}

export class DisplayMultipleMonadObject extends DisplayMonadObject {
  private borderTitle: string; // The title in the border (that is, the name of the object type)
  private hasPredecessor: boolean; // Is this textual component split and has a preceding part?
  private hasSuccessor: boolean; // Is this textual component split and has a succeeding part?
  private isPatriarch: boolean; // Is this object the patriarch (that is, the single top-level object)?

  /** Creates a DisplayMultipleMonadObject for a non-patriarch textual component. */
  constructor(
    mmo: MultipleMonadObject,
    objType: string,
    level: number,
    monadPair: MonadPair,
    monadix: number,
    hasPredecessor: boolean,
    hasSuccessor: boolean,
  );
  /** Creates a DisplayMultipleMonadObject for the patriarch (top-level) textual component. */
  constructor(mmo: MultipleMonadObject, objType: string, level: number, monadSet: MonadSet);
  constructor(
    mmo: MultipleMonadObject,
    objType: string,
    level: number,
    monadSet: MonadPair | MonadSet,
    monadix?: number,
    hasPredecessor?: boolean,
    hasSuccessor?: boolean,
  ) {
    super(mmo, objType, level);

    if (arguments.length === 7) {
      // Non-patriarch
      this.isPatriarch = false;
      this.range = monadSet as MonadPair;
      this.mix = monadix!;
      this.children = [];

      this.hasPredecessor = hasPredecessor!;
      this.hasSuccessor = hasSuccessor!;
      this.borderTitle = getObjectFriendlyName(objType);
    } else {
      // Patriarch
      this.isPatriarch = true;

      const mseg: MonadPair[] = (monadSet as MonadSet).segments;
      this.range = { low: mseg[0].low, high: mseg[mseg.length - 1].high };
      this.mix = 0;
      this.children = [];

      this.hasPredecessor = false;
      this.hasSuccessor = false;
      this.borderTitle = "";
    }
  }

  public generateHtml(
    qd: QuizData | null,
    sentenceTextArr: string[],
    quizMonads: MonadSet,
    ctx: DisplayCtx,
  ): string {
    let spanclass = `lev${this.level} dontshowborder noseplin`; // The class of the <span> element containing this object
    if (this.hasPredecessor) spanclass += " hasp";
    if (this.hasSuccessor) spanclass += " hass";

    let grammar = ""; // The class of the <span> element containing grammar information
    let indent = 0; // The current indentation level (for Hebrew clauses)

    if (ctx.sentencegrammar[this.level]) {
      ctx.sentencegrammar[this.level].walkFeatureValues(
        asFeatureMap(this.displayedMo.mo.features),
        this.mix,
        this.objType,
        true,
        toReaderL10n(ctx.l10n),
        toReaderTypeInfo(ctx.typeinfo),
        (whattype, objType, _origObjType, featName, featValLoc) => {
          if (whattype === WHAT.feature || whattype === WHAT.metafeature) {
            if (getConfiguration().databaseName === "ETCBC4" && objType === "clause_atom" && featName === "tab")
              indent = +featValLoc;
            else grammar += `<span class="xgrammar dontshowit ${objType}_${featName}">:${featValLoc}</span>`;
          }
        },
      );
    }

    let jq: string; // The resulting HTML is built in this string

    if (this.isPatriarch) {
      // The patriarch object (topmost level) is not displayable
      jq = `<span class="${spanclass}"></span>`;
    } else if (this.displayedMo.mo.name === "dummy") {
      // We have an object that is not part of the hierarchy (frequent with Greek "δὲ").
      jq = `<span class="${spanclass}"><span class="nogram dontshowit" data-idd="${this.displayedMo.mo.id_d}" data-mix="0"></span></span>`;
    } else if (getConfiguration().databaseName === "ETCBC4" && this.level === 2) {
      // Special case: Add indentation information to Hebrew clauses.
      jq =
        `<span class="notdummy ${spanclass}">` +
        `<span class="gram dontshowit" data-idd="${this.displayedMo.mo.id_d}" data-mix="${this.mix}">` +
        getObjectShortFriendlyName(this.objType) +
        grammar +
        "</span>" +
        `<span class="xgrammar clause_atom_tab dontshowit indentation" data-indent="${indent}">` +
        "</span>" +
        "</span>";
    } else {
      // Normal case: We have a displayable object
      jq =
        `<span class="notdummy ${spanclass}">` +
        `<span class="gram dontshowit" data-idd="${this.displayedMo.mo.id_d}" data-mix="${this.mix}">` +
        getObjectShortFriendlyName(this.objType) +
        grammar +
        "</span>" +
        "</span>";
    }

    // Generate HTML for Emdros objects at lower levels
    for (let ch = 0; ch < this.children.length; ++ch) jq += this.children[ch].generateHtml(qd, sentenceTextArr, quizMonads, ctx);

    return jq;
  }
}

/** Convierte las features de un MonadObject al FeatureMap de los walkers. */
export function asFeatureMap(features: { [key: string]: unknown }): { [key: string]: string } {
  return features as unknown as { [key: string]: string };
}

/** Convierte la Localization del quiz al formato ReaderL10n de los walkers. */
export function toReaderL10n(l10n: Localization): ReaderL10n {
  const emdrosobject: Record<string, Record<string, string | undefined>> = {};
  for (const [otype, feats] of Object.entries(l10n.emdrosobject)) {
    emdrosobject[otype] = {};
    for (const [feat, val] of Object.entries(feats))
      if (typeof val === "string") emdrosobject[otype][feat] = val;
  }
  const emdrostype: Record<string, Record<string, string>> = {};
  for (const [et, vals] of Object.entries(l10n.emdrostype ?? {})) {
    emdrostype[et] = {};
    for (const [ev, evStr] of Object.entries(vals)) emdrostype[et][ev] = evStr;
  }
  return {
    emdrosobject,
    emdrostype,
    grammargroup: l10n.grammargroup,
    grammarfeature: l10n.grammarfeature,
    grammarmetafeature: l10n.grammarmetafeature,
    grammarsubfeature: l10n.grammarsubfeature,
  };
}

/** Convierte el TypeInfo del quiz al formato ReaderTypeInfo de los walkers. */
export function toReaderTypeInfo(typeinfo: TypeInfo): ReaderTypeInfo {
  return { obj2feat: typeinfo.obj2feat };
}
