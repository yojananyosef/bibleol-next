/**
 * reader/display.ts — Port de la jerarquía de visualización de
 * `BibleOL/ts/dictionary.ts` (creación de DisplayMonadObjects) +
 * `BibleOL/ts/displaymonadobject.ts` (generación de HTML), como árbol de
 * datos puro comprobable en node.
 *
 * El árbol replica 1:1 el HTML del legacy:
 *   - level 0 = palabras (DisplaySingleMonadObject)
 *   - levels 1..max-2 = phrase/clause/… divididos en segmentos contiguos
 *     (DisplayMultipleMonadObject por segmento, con hasp/hass)
 *   - nivel superior = el "Patriarch" (no displayable, sin gram)
 *   - los objetos "dummy" (palabras fuera de la jerarquía) no son displayables
 *   - las features de cada objeto se evalúan con walkFeatureValues (abbrev
 *     para niveles >0, completo para palabras) usando las features del JSON
 *     (incluyendo las de subobjeto, p.ej. clause_atom:tab)
 */

import type { MonadObjectJSON } from "@/lib/corpus/dictionary";
import {
  WHAT,
  type ReaderL10n,
  type ReaderObjectSettings,
  type ReaderTypeInfo,
  type SentenceGrammar,
} from "./sentencegrammar.ts";
import type { Charset } from "./charset.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del árbol de visualización
// ─────────────────────────────────────────────────────────────────────────────

/** Una feature de la gramática interlinear de una palabra (.wordgrammar). */
export interface DisplayWordGrammar {
  featName: string;
  value: string;
  wordclass: string;
}

export interface DisplayWord {
  kind: "word";
  idd: number;
  monad: number;
  /** Texto surface del legacy: `features[surfaceFeature] + suffix`. */
  text: string;
  verse: number | null;
  bcv: (string | number)[];
  /** null si hay espacio normal tras la palabra; si no, clase cont/contx. */
  cont: "cont" | "contx" | null;
  features: Record<string, string> | null;
  wordgrammar: DisplayWordGrammar[];
  /** frequency_rank si existe (colorización); null si no. */
  frequencyRank: number | null;
}

export interface DisplayGrammarItem {
  objType: string;
  featName: string;
  value: string;
}

export interface DisplayBox {
  kind: "box";
  level: number;
  idd: number;
  objType: string;
  mix: number;
  /** Rango monad del segmento [lo, hi]. */
  lo: number;
  hi: number;
  hasp: boolean;
  hass: boolean;
  dummy: boolean;
  shortName: string;
  grammar: DisplayGrammarItem[];
  /** Features crudas del objeto (para el diálogo de información gramatical). */
  features: Record<string, string> | null;
  /** Valor de clause_atom:tab (ETCBC4 nivel 2); null si no aplica. */
  indent: number | null;
  children: DisplayNode[];
}

export type DisplayNode = DisplayWord | DisplayBox;

export interface DisplayTree {
  root: DisplayBox;
  /** Rango de tab de las cláusulas (ETCBC4) para los indicadores. */
  indentMin: number;
  indentMax: number;
}

export interface DisplayBuildOptions {
  grammar: SentenceGrammar[];
  l10n: ReaderL10n;
  typeinfo: ReaderTypeInfo;
  objectSettings: ReaderObjectSettings;
  charset: Charset;
  databaseName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extrae los segmentos monad range de "{ 1-39 }" → [1,39] pares. */
export function segments(monads: string): [number, number][] {
  return (monads.match(/-?\d+\s*-\s*-?\d+|−?\d+/g) ?? []).map((m) => {
    const seg = m.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
    if (seg === null) return [parseInt(m.replace("−", "-"), 10), parseInt(m.replace("−", "-"), 10)];
    return [parseInt(seg[1], 10), parseInt(seg[2], 10)];
  });
}

// getObjectFriendlyName / getObjectShortFriendlyName (localization.ts)
function getObjectFriendlyName(otype: string, l10n: ReaderL10n): string {
  if (otype === "Patriarch") return otype;
  return l10n.emdrosobject[otype]?._objname ?? otype;
}

function getObjectShortFriendlyName(otype: string, l10n: ReaderL10n): string {
  if (l10n.emdrosobject[`${otype}_abbrev`] === undefined)
    return getObjectFriendlyName(otype, l10n);
  return l10n.emdrosobject[`${otype}_abbrev`]?._objname ?? getObjectFriendlyName(otype, l10n);
}

// Dictionary.boxes (dictionary.ts): indicador "N▪▪▪" para la sangría hebrea.
export function indentationIndicator(num: number, minnum: number, maxnum: number): string {
  const numspaces = num < 10 ? num : num - 1;
  let s = "";
  for (let i = minnum; i < numspaces; ++i) s += "\u00a0";
  s += num;
  for (let i = num; i <= maxnum; ++i) s += "\u25aa";
  return s + "\u00a0\u00a0";
}

// DisplaySingleMonadObject.generateHtml: clase del <span class="wordgrammar">
function wordclassFor(
  featName: string,
  fs: { foreignText?: boolean; transliteratedText?: boolean; isGloss?: boolean } | undefined,
  charset: Charset,
): string {
  if (fs?.foreignText) return charset.foreignClass;
  if (fs?.transliteratedText && charset.transliteratedClass !== undefined) return charset.transliteratedClass;
  if (fs?.isGloss && featName !== "zh-Hans" && featName !== "zh-Hant") return "tenpoint ltr";
  return "ltr";
}

// DisplaySingleMonadObject.generateHtml: solo el primer gloss (ETCBC4)
export function firstGlossOnly(value: string): string {
  return value
    .replace(/(&[gl]t);/, "$1Q")
    .replace(/([^,;(]+).*/, "$1")
    .replace(/(&[gl]t)Q/, "$1;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción del árbol
// ─────────────────────────────────────────────────────────────────────────────

export function buildDisplayTree(
  dictionary: { monadObjects: { level: number; objects: MonadObjectJSON[] }[] },
  opts: DisplayBuildOptions,
): DisplayTree {
  const levels = [...dictionary.monadObjects].sort((a, b) => a.level - b.level);
  const maxLevels = levels.length;
  const objAt = (lev: number): MonadObjectJSON[] => levels[lev]?.objects ?? [];

  // Nivel 0: palabras
  const wordNodes: DisplayWord[] = [];
  for (const o of objAt(0)) {
    if (o.kind !== "single") continue;
    const monad = parseInt(o.monads.match(/-?\d+/)?.[0] ?? "0", 10);
    const features = o.features ?? {};
    wordNodes.push({
      kind: "word",
      idd: o.id_d,
      monad,
      text: (o.text ?? "") + (o.suffix ?? ""),
      verse: o.sameAsPrev && !o.sameAsPrev[2] ? (Number(o.bcv?.[2]) || null) : null,
      bcv: o.bcv ?? [],
      cont: o.suffix === "" ? "cont" : o.suffix === "-" || o.suffix === "\u05be" ? "contx" : null,
      features: o.features,
      wordgrammar: wordGrammarFor(o, opts),
      frequencyRank: features.frequency_rank !== undefined ? (parseInt(features.frequency_rank, 10) || null) : null,
    });
  }
  wordNodes.sort((a, b) => a.monad - b.monad);

  // Niveles 1..maxLevels-1: objetos "multiple" divididos en segmentos
  const levelBoxes: DisplayBox[][] = [[]];
  for (let lev = 1; lev < maxLevels; ++lev) {
    const isPatriarch = lev === maxLevels - 1;
    const objType = isPatriarch ? "Patriarch" : opts.grammar[lev]?.objType ?? "";
    const sengram = opts.grammar[lev];
    const boxes: DisplayBox[] = [];

    for (const o of objAt(lev)) {
      if (o.kind !== "multiple") continue;
      const segs = segments(o.monads);

      for (let mix = 0; mix < segs.length; ++mix) {
        const [lo, hi] = segs[mix];
        const features = o.features ?? {};
        const merged: Record<string, string> = { ...features };
        for (const [k, v] of Object.entries(o.subobjects?.[mix] ?? {})) {
          if (v !== null) merged[k] = v;
        }

        let indent: number | null = null;
        const grammar: DisplayGrammarItem[] = [];
        if (sengram && !isPatriarch) {
          sengram.walkFeatureValues(merged, mix, objType, true, opts.l10n, opts.typeinfo, (whattype, wObjType, _origObjType, featName, value) => {
            if (whattype !== WHAT.feature && whattype !== WHAT.metafeature) return;
            if (opts.databaseName === "ETCBC4" && wObjType === "clause_atom" && featName === "tab") {
              indent = value === "" ? null : Number(value);
            } else {
              grammar.push({ objType: wObjType, featName, value });
            }
          });
        }

        boxes.push({
          kind: "box",
          level: lev,
          idd: o.id_d,
          objType,
          mix,
          lo,
          hi,
          hasp: mix > 0,
          hass: mix < segs.length - 1,
          dummy: !isPatriarch && o.name === "dummy",
          shortName: isPatriarch ? "Patriarch" : getObjectShortFriendlyName(objType, opts.l10n),
          grammar,
          features: o.features ?? null,
          indent,
          children: [],
        });
      }
    }
    boxes.sort((a, b) => a.lo - b.lo);
    levelBoxes.push(boxes);
  }

  // Enlazado padre-hijo por contención de rangos (como el legacy: containedIn)
  const parented = new Set<DisplayNode>();
  for (let lev = 1; lev < maxLevels; ++lev) {
    for (const parent of levelBoxes[lev]) {
      for (const child of lev === 1 ? wordNodes : levelBoxes[lev - 1]) {
        const cl = child.kind === "word" ? child.monad : child.lo;
        const ch = child.kind === "word" ? child.monad : child.hi;
        if (cl >= parent.lo && ch <= parent.hi && !parented.has(child)) {
          parented.add(child);
          parent.children.push(child);
        }
      }
    }
  }

  const root = levelBoxes[maxLevels - 1][0];

  // Indentación de cláusulas (ETCBC4): min/max de tab en todo el texto
  let indentMin = 0;
  let indentMax = 0;
  if (opts.databaseName === "ETCBC4") {
    const indents = levelBoxes.flat().map((b) => b.indent).filter((i): i is number => i !== null);
    if (indents.length > 0) {
      indentMin = Math.min(...indents);
      indentMax = Math.max(...indents);
    }
  }

  return { root, indentMin, indentMax };
}

// ─────────────────────────────────────────────────────────────────────────────
// Features de palabra (.wordgrammar)
// ─────────────────────────────────────────────────────────────────────────────

function wordGrammarFor(o: MonadObjectJSON, opts: DisplayBuildOptions): DisplayWordGrammar[] {
  const sengram = opts.grammar[0];
  const out: DisplayWordGrammar[] = [];
  if (!sengram || o.features === null) return out;
  const settings = opts.objectSettings[opts.grammar[0].objType]?.featuresetting ?? {};
  sengram.walkFeatureValues(o.features, 0, sengram.objType, false, opts.l10n, opts.typeinfo, (whattype, _objType, _origObjType, featName, value) => {
    if (whattype === WHAT.metafeature) {
      out.push({ featName, value, wordclass: "ltr" });
    } else if (whattype === WHAT.feature) {
      let v = value;
      if (opts.databaseName === "ETCBC4" && settings[featName]?.isGloss) v = firstGlossOnly(v);
      out.push({ featName, value: v, wordclass: wordclassFor(featName, settings[featName], opts.charset) });
    }
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de selección de gramática (GrammarSelectionBox)
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que activa implícitamente una feature al marcarla (FollowerBox). */
export type FeatureImplicit = "border" | "seplin" | "wordspace";

export interface GrammarPanelFeature {
  /** Clase del span (wordgrammar o xgrammar): featName o objType_featName. */
  dispKey: string;
  /** Id del checkbox (y clave de sessionStorage): objType_featName_cb. */
  checkboxId: string;
  objType: string;
  featName: string;
  label: string | null;
  level: number;
  implicit: FeatureImplicit;
}

export interface GrammarPanelGroup {
  /** Nombre localizado del grupo; null si las features van sin grupo. */
  name: string | null;
  features: GrammarPanelFeature[];
  /** Contiene frequency_rank → muestra el campo "color limit". */
  hasFrequency: boolean;
}

/** Checkboxes iniciales de un nivel (Separate lines / Show border / Word spacing). */
export interface GrammarPanelInitBox {
  id: string;
  label: string;
  kind: "seplin" | "border" | "wordspace";
  level: number;
}

export interface GrammarPanelLevel {
  level: number;
  objType: string;
  objName: string;
  init: GrammarPanelInitBox[];
  groups: GrammarPanelGroup[];
}

/**
 * Construye el modelo del panel de selección de gramática
 * (equivalente a GrammarSelectionBox.generateHtml + setHandlers).
 */
export function buildGrammarPanel(
  grammar: SentenceGrammar[],
  l10n: ReaderL10n,
  charset: Charset,
  databaseName: string,
): GrammarPanelLevel[] {
  return grammar.map((sg, level) => {
    const groups: GrammarPanelGroup[] = [];
    let current: GrammarPanelGroup | null = null;
    const closeGroup = () => {
      if (current !== null) {
        if (current.features.length > 0) groups.push(current);
        current = null;
      }
    };

    sg.walkFeatureNames(sg.objType, l10n, (whattype, objType, _origObjType, featName, featNameLoc) => {
      if (whattype === WHAT.groupstart) {
        closeGroup();
        current = { name: featNameLoc, features: [], hasFrequency: false };
        return;
      }
      if (whattype === WHAT.groupend) {
        closeGroup();
        return;
      }
      const isTab = databaseName === "ETCBC4" && objType === "clause_atom" && featName === "tab";
      const implicit: FeatureImplicit = level === 0 ? "wordspace" : isTab ? "seplin" : "border";
      if (current === null) current = { name: null, features: [], hasFrequency: false };
      current.features.push({
        dispKey: level === 0 ? featName : `${objType}_${featName}`,
        checkboxId: `${objType}_${featName}_cb`,
        objType,
        featName,
        label: featNameLoc,
        level,
        implicit,
      });
      if (objType === "word" && featName === "frequency_rank") current.hasFrequency = true;
    });
    closeGroup();

    const init: GrammarPanelInitBox[] = [];
    if (level === 0) {
      if (charset.isHebrew) init.push({ id: "ws_cb", label: "Word spacing", kind: "wordspace", level: 0 });
    } else if (level < grammar.length - 1) {
      init.push({ id: `lev${level}_seplin_cb`, label: "Separate lines", kind: "seplin", level });
      init.push({ id: `lev${level}_sb_cb`, label: "Show border", kind: "border", level });
    }

    return { level, objType: sg.objType, objName: getObjectFriendlyName(sg.objType, l10n), init, groups };
  });
}
