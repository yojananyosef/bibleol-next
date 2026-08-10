"use client";

// features-tab.tsx — Port de `BibleOL/ts/paneltemplquizfeatures.ts` (tab
// "Features" del editor de ejercicios) a React.
//
// Estructura 1:1 con el legacy:
//  - PanelTemplQuizFeatures → FeaturesTab (paneles por tipo de objeto, solo el
//    visible se muestra; los paneles construidos se conservan al cambiar).
//  - PanelForOneOtype     → buildPanel() (filas de la pregunta + "otras
//    objets" del sentencegrammar + filas manuales Linkage / Syntactic Code +
//    límite de glosses).
//  - ButtonsAndLabel      → FeatureRow + renderRow().
//  - LimitDialog          → LimitDialog (componente).
//  - El orden de las features solicitadas vive en FeatureOrder (editor-logic).

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getConfiguration,
  getFeatureSetting,
  getObjectSetting,
  getTypeInfo,
  type FeatureSetting,
} from "@/legacy-ts/configuration";
import {
  localize,
  getFeatureFriendlyName,
  getFeatureValueFriendlyName,
  getObjectFriendlyName,
  type Localization,
} from "@/legacy-ts/localization";
import { StringWithSort } from "@/legacy-ts/stringwithsort";
import { toReaderL10n } from "@/legacy-ts/displaymonadobject";
import {
  enhanceSentenceGrammar,
  getSentenceGrammarFor,
  WHAT,
  type ReaderSentenceGrammar,
  type SentenceGrammar,
} from "@/lib/reader/sentencegrammar";
import {
  ARAMAIC_STEMS,
  ButtonSelection,
  FeatureOrder,
  HEBREW_STEMS,
  columnsFor,
  type EditorQuizFeatures,
} from "@/lib/quiz/editor-logic";

// ---------------------------------------------------------------------------
// Datos de una fila (ButtonsAndLabel del legacy)
// ---------------------------------------------------------------------------

export interface FeatureRow {
  featName: string;
  label: string;
  otype: string;
  select: ButtonSelection;
  canShow: boolean;
  canRequest: boolean;
  canDisplayGrammar: boolean;
  canUseDropDown: boolean;
  ddChecked: boolean;
  hideFeatures: string[] | null;
  hasLimitBadge: boolean;
}

export interface OtypePanel {
  otype: string;
  rows: FeatureRow[];
  otherRows: Record<string, FeatureRow[]>;
  glosslimit: number;
}

// ---------------------------------------------------------------------------
// Selectores iniciales (PanelTemplQuizFeatures::getSelector/getHideFeatures/
// getObjectSelector)
// ---------------------------------------------------------------------------

function getSelector(qf: EditorQuizFeatures, feat: string): ButtonSelection {
  if (qf.showFeatures.indexOf(feat) !== -1) return ButtonSelection.SHOW;
  for (const rf of qf.requestFeatures) if (rf.name === feat) return rf.usedropdown ? ButtonSelection.REQUEST_DROPDOWN : ButtonSelection.REQUEST;
  if (qf.dontShowFeatures.indexOf(feat) !== -1) return ButtonSelection.DONT_SHOW;
  return ButtonSelection.DONT_CARE;
}

function getHideFeatures(qf: EditorQuizFeatures, feat: string): string[] | null {
  for (const rf of qf.requestFeatures) if (rf.name === feat) return rf.hideFeatures ?? null;
  return null;
}

function getObjectSelector(qf: EditorQuizFeatures, otype: string, featName: string): ButtonSelection {
  const regex = new RegExp(`\\b${featName}\\b`);
  for (const d of qf.dontShowObjects) {
    if (d.content === otype) {
      if (d.show !== undefined && d.show.match(regex)) return ButtonSelection.DONT_CARE;
      else return ButtonSelection.DONT_SHOW;
    }
  }
  return ButtonSelection.DONT_CARE;
}

// ---------------------------------------------------------------------------
// Construcción de un panel para un tipo de objeto (PanelForOneOtype)
// ---------------------------------------------------------------------------

function buildPanel(
  otype: string,
  qf: EditorQuizFeatures,
  useSaved: boolean,
  grammar: SentenceGrammar[],
  l10n: Localization,
): OtypePanel {
  const cfg = getConfiguration();
  const typeinfo = getTypeInfo();
  const readerL10n = toReaderL10n(l10n);
  const rows: FeatureRow[] = [];
  const otherRows: Record<string, FeatureRow[]> = {};

  // ---- "visual" pseudo feature --------------------------------------------
  const hasSurface = cfg.objHasSurface === otype;
  const visualSelect = useSaved ? getSelector(qf, "visual") : ButtonSelection.DONT_CARE;
  const visualUseDD =
    hasSurface && Boolean(getFeatureSetting(otype, cfg.surfaceFeature).alternateshowrequestSql);
  rows.push({
    featName: "visual",
    label: localize("visual"),
    otype,
    select: visualSelect,
    canShow: true,
    canRequest: hasSurface,
    canDisplayGrammar: hasSurface,
    canUseDropDown: visualUseDD,
    ddChecked: visualUseDD && visualSelect !== ButtonSelection.REQUEST,
    hideFeatures: null,
    hasLimitBadge: false,
  });

  // ---- genuine features -----------------------------------------------------
  const sg = getSentenceGrammarFor(grammar, otype);
  const hasSurfaceFeature = cfg.objHasSurface === otype;
  const keylist: string[] = [];

  // Ignores features that cannot be used for selection, unless they belong to
  // a SentenceGrammar
  for (const featName of Object.keys(getObjectSetting(otype).featuresetting ?? {})) {
    const featset = getFeatureSetting(otype, featName);
    if (featset.ignoreShow && featset.ignoreRequest && (sg === null || !sg.containsFeature(featName)))
      continue;
    if (typeinfo.obj2feat?.[otype]?.[featName] === "url") continue;
    if (hasSurfaceFeature && featName === cfg.surfaceFeature) continue;
    keylist.push(featName);
  }

  for (const featName of keylist) {
    const featset = getFeatureSetting(otype, featName);
    const valueType = typeinfo.obj2feat?.[otype]?.[featName] ?? "";
    const useDropDown = Boolean(featset.alternateshowrequestSql);
    const sel = useSaved ? getSelector(qf, featName) : ButtonSelection.DONT_CARE;
    rows.push({
      featName,
      label: getFeatureFriendlyName(otype, featName),
      otype,
      select: sel,
      canShow: !featset.ignoreShow,
      canRequest: !featset.ignoreRequest,
      canDisplayGrammar: sg !== null && sg.containsFeature(featName),
      canUseDropDown: useDropDown,
      ddChecked: useDropDown && sel !== ButtonSelection.REQUEST,
      hideFeatures: useSaved ? getHideFeatures(qf, featName) : null,
      hasLimitBadge: (typeinfo.enumTypes ?? []).indexOf(valueType) !== -1,
    });
  }

  // ---- manual rows (Linkage + Syntactic Code) -------------------------------
  for (const [real, friendly] of [
    ["code_TYPE_text", "Linkage"],
    ["code", "Syntactic Code"],
  ] as const) {
    rows.push({
      featName: real,
      label: friendly,
      otype,
      select: useSaved ? getSelector(qf, real) : ButtonSelection.DONT_CARE,
      canShow: false,
      canRequest: false,
      canDisplayGrammar: true,
      canUseDropDown: false,
      ddChecked: false,
      hideFeatures: useSaved ? getHideFeatures(qf, real) : null,
      hasLimitBadge: false,
    });
  }

  // ---- other object types (from the sentencegrammar) ------------------------
  for (const sgo of grammar) {
    const otherOtype = sgo.objType;
    if (otherOtype === otype || !cfg.objectSettings[otherOtype]?.mayselect) continue;

    const list: FeatureRow[] = [];
    let hasSeenGlosses = false;

    sgo.walkFeatureNames(otherOtype, readerL10n, (whattype, feobType, origObjType, featName, featNameLoc) => {
      if (whattype !== WHAT.feature && whattype !== WHAT.metafeature) return;

      if (whattype === WHAT.feature && getFeatureSetting(feobType, featName).isGloss !== undefined) {
        if (hasSeenGlosses) return;
        hasSeenGlosses = true;
        featName = "glosses";
        featNameLoc = localize("glosses");
      }

      if (getTypeInfo().obj2feat?.[feobType]?.[featName] === "url") return;

      list.push({
        featName,
        label: featNameLoc ?? featName,
        otype: feobType,
        select: useSaved ? getObjectSelector(qf, origObjType, featName) : ButtonSelection.DONT_CARE,
        canShow: false,
        canRequest: false,
        canDisplayGrammar: true,
        canUseDropDown: false,
        ddChecked: false,
        hideFeatures: null,
        hasLimitBadge: false,
      });
    });

    if (list.length > 0) otherRows[otherOtype] = list;
  }

  return { otype, rows, otherRows, glosslimit: qf.glosslimit };
}

// ---------------------------------------------------------------------------
// FeaturesTab
// ---------------------------------------------------------------------------

export interface FeaturesTabHandle {
  /** getInfo(): especificación de features (1:1 con PanelTemplQuizFeatures). */
  getInfo(): EditorQuizFeatures;
  /** isDirty(): la especificación actual difiere de la del fichero. */
  isDirty(): boolean;
  noRequestFeatures(): boolean;
  noShowFeatures(): boolean;
}

export interface FeaturesTabProps {
  initialQf: EditorQuizFeatures;
  orderFeatures: string[];
  /** Tipo de objeto de la pregunta (el "question object" del editor). */
  otype: string;
  l10n: Localization;
  onChanged: () => void;
}

export const FeaturesTab = forwardRef<FeaturesTabHandle, FeaturesTabProps>(function FeaturesTab(
  { initialQf, orderFeatures, otype, l10n, onChanged },
  ref,
) {
  const grammar = useMemo(
    () => enhanceSentenceGrammar(getConfiguration().sentencegrammar as unknown as ReaderSentenceGrammar[]),
    [],
  );

  // Paneles construidos (se conservan al cambiar de tipo de objeto).
  const [panels, setPanels] = useState<Record<string, OtypePanel>>({});
  const [order] = useState<FeatureOrder>(() => {
    const o = new FeatureOrder();
    if (orderFeatures.length > 0) {
      o.featureArray = [...orderFeatures];
      o.n = orderFeatures.length;
      o.initialize = false;
    }
    return o;
  });
  const [, setTick] = useState(0);
  const bumpOrder = () => setTick((t) => t + 1);

  const [limitRow, setLimitRow] = useState<{ row: FeatureRow; valueType: string; featset: FeatureSetting } | null>(null);

  // El primer otype pedido por el editor es el que lleva los valores guardados
  // (el editor repuebla Features al arrancar con el "question object" inicial).
  const firstOtypeRef = useRef<string>(otype);

  const ensurePanel = useCallback(
    (o: string) => {
      const useSaved = o === firstOtypeRef.current;
      setPanels((prev) =>
        prev[o] ? prev : { ...prev, [o]: buildPanel(o, initialQf, useSaved, grammar, l10n) },
      );
    },
    [initialQf, grammar, l10n],
  );

  useEffect(() => {
    // Paneles para el tipo inicial (el legacy los construye al "populate"
    // desde el selector de frases/unidades).
    ensurePanel(otype);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ensurePanel(otype);
  }, [otype, ensurePanel]);

  const visible = panels[otype] ?? buildPanel(otype, initialQf, false, grammar, l10n);

  // ------------------------------------------------------- mutaciones

  function updateRow(o: string, featName: string, patch: Partial<FeatureRow>): void {
    setPanels((prev) => {
      const p = prev[o];
      if (!p) return prev;
      const patchList = (list: FeatureRow[]): FeatureRow[] =>
        list.map((r) => (r.featName === featName ? { ...r, ...patch } : r));
      const rows = patchList(p.rows);
      const otherRows: Record<string, FeatureRow[]> = {};
      let changed = rows !== p.rows;
      for (const [k, list] of Object.entries(p.otherRows)) {
        otherRows[k] = patchList(list);
        if (otherRows[k] !== list) changed = true;
      }
      if (!changed) return prev;
      return { ...prev, [o]: { ...p, rows, otherRows } };
    });
  }

  function setSelect(o: string, featName: string, sel: ButtonSelection): void {
    const p = visible;
    const find = (list: FeatureRow[]): FeatureRow | undefined => list.find((r) => r.featName === featName);
    const row = find(p.rows) ?? Object.values(p.otherRows).map(find).find((r) => r !== undefined);
    if (!row) return;

    const wasRequest = row.select === ButtonSelection.REQUEST || row.select === ButtonSelection.REQUEST_DROPDOWN;
    const nowRequest = sel === ButtonSelection.REQUEST || sel === ButtonSelection.REQUEST_DROPDOWN;
    if (order) {
      if (nowRequest && !wasRequest) order.addRequest(featName);
      else if (!nowRequest && wasRequest) order.unselectReqFeat(featName);
    }
    updateRow(o, featName, { select: sel });
    onChanged();
  }

  function setAllOther(sel: ButtonSelection): void {
    const o = visible.otype;
    const p = visible;
    for (const list of Object.values(p.otherRows))
      for (const r of list)
        if (r.select === ButtonSelection.REQUEST || r.select === ButtonSelection.REQUEST_DROPDOWN)
          order?.unselectReqFeat(r.featName);
    setPanels((prev) => {
      const pp = prev[o];
      if (!pp) return prev;
      const otherRows: Record<string, FeatureRow[]> = {};
      for (const [k, list] of Object.entries(pp.otherRows))
        otherRows[k] = list.map((r) => ({ ...r, select: sel }));
      return { ...prev, [o]: { ...pp, otherRows } };
    });
    onChanged();
  }

  function moveTo(featName: string, newIdx: number): void {
    
    order.moveTo(featName, newIdx);
    bumpOrder();
    onChanged();
  }

  // ------------------------------------------------------------------ handle

  useImperativeHandle(ref, () => ({
    getInfo(): EditorQuizFeatures {
      const p = visible;
      const qf: EditorQuizFeatures = {
        showFeatures: [],
        requestFeatures: [],
        dontShowFeatures: [],
        dontShowObjects: [],
        glosslimit: p.glosslimit,
      };

      // "visual" pseudo feature
      const vb = p.rows[0];
      if (vb.select === ButtonSelection.SHOW) qf.showFeatures.push("visual");
      else if (vb.select === ButtonSelection.REQUEST || vb.select === ButtonSelection.REQUEST_DROPDOWN)
        qf.requestFeatures.push({
          name: "visual",
          usedropdown: vb.ddChecked,
          hideFeatures: null,
          order_val: order?.rankOf("visual") ?? "",
        });
      else if (vb.select === ButtonSelection.DONT_SHOW) qf.dontShowFeatures.push("visual");

      // Question object features (rows 1..) — Note: also the manual rows
      for (const bal of p.rows) {
        if (bal === vb) continue;
        if (bal.select === ButtonSelection.SHOW) qf.showFeatures.push(bal.featName);
        else if (bal.select === ButtonSelection.REQUEST || bal.select === ButtonSelection.REQUEST_DROPDOWN)
          qf.requestFeatures.push({
            name: bal.featName,
            usedropdown: bal.ddChecked,
            hideFeatures: bal.hideFeatures,
            order_val: order?.rankOf(bal.featName) ?? "",
          });
        else if (bal.select === ButtonSelection.DONT_SHOW) qf.dontShowFeatures.push(bal.featName);
      }

      // Other objects
      for (const [otherOtype, list] of Object.entries(p.otherRows)) {
        let allDONT_CARE = true;
        for (const bal of list) {
          if (bal.select === ButtonSelection.DONT_SHOW) {
            allDONT_CARE = false;
            break;
          }
        }
        if (!allDONT_CARE) {
          const showstring: string[] = [];
          for (const bal of list) if (bal.select === ButtonSelection.DONT_CARE) showstring.push(bal.featName);
          if (showstring.length === 0) qf.dontShowObjects.push({ content: otherOtype });
          else qf.dontShowObjects.push({ content: otherOtype, show: showstring.join(" ") });
        }
      }

      return qf;
    },

    isDirty(): boolean {
      const qfnow = this.getInfo();
      const q = initialQf;

      if (
        qfnow.showFeatures.length !== q.showFeatures.length ||
        qfnow.requestFeatures.length !== q.requestFeatures.length ||
        qfnow.dontShowFeatures.length !== q.dontShowFeatures.length ||
        qfnow.dontShowObjects.length !== q.dontShowObjects.length ||
        qfnow.glosslimit !== q.glosslimit
      )
        return true;

      for (let i = 0; i < qfnow.showFeatures.length; ++i)
        if (qfnow.showFeatures[i] !== q.showFeatures[i]) return true;

      for (let i = 0; i < qfnow.requestFeatures.length; ++i) {
        const n = qfnow.requestFeatures[i];
        const o = q.requestFeatures[i];
        if (n.name !== o.name || n.usedropdown !== o.usedropdown) return true;

        if (n.hideFeatures !== o.hideFeatures) {
          if (
            n.hideFeatures === null ||
            o.hideFeatures === null ||
            n.hideFeatures.length !== o.hideFeatures.length
          )
            return true;
          for (let j = 0; j < n.hideFeatures.length; ++j)
            if (n.hideFeatures[j] !== o.hideFeatures[j]) return true;
        }
      }

      for (let i = 0; i < qfnow.dontShowFeatures.length; ++i)
        if (qfnow.dontShowFeatures[i] !== q.dontShowFeatures[i]) return true;

      for (let i = 0; i < qfnow.dontShowObjects.length; ++i) {
        const n = qfnow.dontShowObjects[i];
        const o = q.dontShowObjects[i];
        if (n.content !== o.content || (n.show ?? undefined) !== (o.show ?? undefined)) return true;
      }

      return false;
    },

    noRequestFeatures(): boolean {
      for (const bal of visible.rows)
        if (bal.select === ButtonSelection.REQUEST || bal.select === ButtonSelection.REQUEST_DROPDOWN) return false;
      return true;
    },

    noShowFeatures(): boolean {
      if (visible.rows[0].select === ButtonSelection.SHOW) return false;
      for (const bal of visible.rows) if (bal.select === ButtonSelection.SHOW) return false;
      return true;
    },
  }));

  // ------------------------------------------------------------------ render

  const renderRadios = (row: FeatureRow, namePrefix: string): React.ReactNode => {
    const radio = (sel: ButtonSelection, enabled: boolean, label: string): React.ReactNode =>
      enabled ? (
        <label className="flex items-center gap-1 text-xs">
          <input
            type="radio"
            name={`${namePrefix}_${row.featName}`}
            checked={row.select === sel}
            onChange={() => setSelect(visible.otype, row.featName, sel)}
          />
          {label}
        </label>
      ) : null;

    return (
      <td className="px-1">
        {radio(ButtonSelection.SHOW, row.canShow, localize("show"))}
        {radio(ButtonSelection.REQUEST, row.canRequest, localize("request"))}
        {radio(ButtonSelection.DONT_CARE, true, localize("dont_care"))}
        {radio(ButtonSelection.DONT_SHOW, row.canDisplayGrammar, localize("dont_show"))}
        {row.canUseDropDown ? (
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={row.ddChecked}
              disabled={!(row.select === ButtonSelection.REQUEST || row.select === ButtonSelection.REQUEST_DROPDOWN)}
              onChange={(e) => {
                updateRow(visible.otype, row.featName, { ddChecked: e.target.checked });
                onChanged();
              }}
            />
            {localize("multiple_choice")}
          </label>
        ) : null}
      </td>
    );
  };

  const renderOrder = (row: FeatureRow): React.ReactNode => {
    if (!row.canRequest || !(row.select === ButtonSelection.REQUEST || row.select === ButtonSelection.REQUEST_DROPDOWN) || !order)
      return null;
    const rank = order.rankOf(row.featName);
    return (
      <select
        className="h-7 rounded border bg-background px-1 text-xs"
        value={rank === "" ? "" : rank}
        disabled={rank === ""}
        onChange={(e) => {
          if (e.target.value === "") return;
          moveTo(row.featName, Number(e.target.value) - 1);
        }}
      >
        {Array.from({ length: Math.max(1, order.n) }, (_, i) => i + 1).map((i) => (
          <option key={i} value={i}>{i}</option>
        ))}
      </select>
    );
  };

  const renderLimit = (row: FeatureRow): React.ReactNode => {
    if (!row.hasLimitBadge || !row.canRequest || !(row.select === ButtonSelection.REQUEST || row.select === ButtonSelection.REQUEST_DROPDOWN))
      return null;
    const limited = row.hideFeatures !== null && row.hideFeatures.length > 0;
    return (
      <button
        type="button"
        className={`rounded px-2 py-0.5 text-xs text-white ${limited ? "bg-red-600" : "bg-green-600"}`}
        onClick={() =>
          setLimitRow({
            row,
            valueType: getTypeInfo().obj2feat?.[row.otype]?.[row.featName] ?? "",
            featset: getFeatureSetting(row.otype, row.featName),
          })
        }
      >
        {limited ? localize("limited") : localize("unlimited")}
      </button>
    );
  };

  const renderMainTable = (p: OtypePanel): React.ReactNode => {
    const th = "px-2 py-1 text-left text-xs font-medium";
    return (
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className={th}>{localize("show")}</th>
            <th className={th}>{localize("request")}</th>
            <th className={th}>{localize("dont_care")}</th>
            <th className={th}>{localize("dont_show")}</th>
            <th className={th}>{localize("multiple_choice")}</th>
            <th className={th}>{localize("feature")}</th>
            <th className={th}>{localize("order")}</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row) => (
            <tr key={row.featName} className="border-b last:border-b-0">
              {renderRadios(row, "feat")}
              <td className="px-1 text-sm">{row.label}</td>
              <td className="px-1">{renderOrder(row)}</td>
              <td className="px-1">{renderLimit(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderOtherTable = (subrows: FeatureRow[]): React.ReactNode => {
    const th = "px-2 py-1 text-left text-xs font-medium";
    return (
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className={th} />
            <th className={th}>{localize("dont_care")}</th>
            <th className={th}>{localize("dont_show")}</th>
            <th className={th}>{localize("feature")}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td />
            <td className="px-1 py-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAllOther(ButtonSelection.DONT_CARE)}
              >
                {localize("set_all")}
              </Button>
            </td>
            <td className="px-1 py-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAllOther(ButtonSelection.DONT_SHOW)}
              >
                {localize("set_all")}
              </Button>
            </td>
            <td />
          </tr>
          {subrows.map((row) => (
            <tr key={row.featName} className="border-b last:border-b-0">
              <td className="px-1">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    name={`sub_${row.otype}_${row.featName}`}
                    checked={row.select === ButtonSelection.DONT_CARE}
                    onChange={() => setSelect(visible.otype, row.featName, ButtonSelection.DONT_CARE)}
                  />
                </label>
              </td>
              <td className="px-1">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    name={`sub_${row.otype}_${row.featName}`}
                    checked={row.select === ButtonSelection.DONT_SHOW}
                    onChange={() => setSelect(visible.otype, row.featName, ButtonSelection.DONT_SHOW)}
                  />
                </label>
              </td>
              <td className="px-1 text-sm">{row.label}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="space-y-3">
      <section className="rounded border">
        <h3 className="border-b bg-muted/40 px-3 py-1.5 text-sm font-medium">{getObjectFriendlyName(visible.otype)}</h3>
        <div className="p-2">{renderMainTable(visible)}</div>
      </section>

      {Object.entries(visible.otherRows).map(([otherOtype, subrows]) => (
        <section key={otherOtype} className="rounded border">
          <h3 className="border-b bg-muted/40 px-3 py-1.5 text-sm font-medium">{getObjectFriendlyName(otherOtype)}</h3>
          <div className="p-2">{renderOtherTable(subrows)}</div>
        </section>
      ))}

      <section className="rounded border">
        <h3 className="border-b bg-muted/40 px-3 py-1.5 text-sm font-medium">{localize("gloss_limit")}</h3>
        <div className="flex items-center gap-2 p-2 text-sm">
          <span>{localize("gloss_limit_prompt")}</span>
          <input
            type="number"
            className="h-8 w-20 rounded border bg-background px-2"
            value={visible.glosslimit}
            onChange={(e) => {
              const v = Number(e.target.value);
              const o = visible.otype;
              setPanels((prev) => {
                const p = prev[o];
                if (!p) return prev;
                return { ...prev, [o]: { ...p, glosslimit: Number.isFinite(v) ? v : 0 } };
              });
              onChanged();
            }}
          />
        </div>
      </section>

      {limitRow ? (
        <LimitDialog
          valueType={limitRow.valueType}
          featset={limitRow.featset}
          hideFeatures={limitRow.row.hideFeatures}
          onSave={(newHideFeatures) => {
            updateRow(visible.otype, limitRow.row.featName, { hideFeatures: newHideFeatures });
            setLimitRow(null);
            onChanged();
          }}
          onClose={() => setLimitRow(null)}
        />
      ) : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// LimitDialog (dialog para limitar los valores que ve el estudiante)
// ---------------------------------------------------------------------------

function LimitDialog({
  valueType,
  featset,
  hideFeatures,
  onSave,
  onClose,
}: {
  valueType: string;
  featset: FeatureSetting;
  hideFeatures: string[] | null;
  onSave: (newHideFeatures: string[]) => void;
  onClose: () => void;
}) {
  const typeinfo = getTypeInfo();
  const cfg = getConfiguration();

  const entries = useMemo(() => {
    const res: { value: string; label: string }[] = [];
    for (const s of typeinfo.enum2values?.[valueType] ?? []) {
      const hv = featset.hideValues;
      const ov = featset.otherValues;
      if ((hv && hv.indexOf(s) !== -1) || (ov && ov.indexOf(s) !== -1)) continue;
      res.push({ value: s, label: getFeatureValueFriendlyName(valueType, s, false, false) });
    }
    const sws = res.map((e) => ({ e, sws: new StringWithSort(e.label, e.value) }));
    sws.sort((a, b) => StringWithSort.compare(a.sws, b.sws));
    return sws.map(({ e }) => e);
  }, [typeinfo, valueType, featset]);

  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const e of entries) init[e.value] = !hideFeatures || hideFeatures.indexOf(e.value) === -1;
    return init;
  });

  const columns = columnsFor(entries.length);
  const rowsN = Math.ceil(entries.length / columns);
  const grid: typeof entries[] = [];
  for (let c = 0; c < columns; ++c) {
    const col: typeof entries = [];
    for (let r = 0; r < rowsN; ++r) {
      const ix = c * rowsN + r;
      if (ix < entries.length) col.push(entries[ix]);
    }
    grid.push(col);
  }

  const setAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    for (const e of entries) next[e.value] = v;
    setChecked(next);
  };

  const setHebrewAramaic = (stems: string[]) => {
    const next: Record<string, boolean> = {};
    for (const e of entries) next[e.value] = stems.indexOf(e.value) !== -1;
    setChecked(next);
  };

  const showStemPresets = cfg.databaseName === "ETCBC4" && valueType === "verbal_stem_t";

  return (
    <Dialog open onOpenChange={(o) => {
      if (!o) onClose();
    }}>
      <DialogContent className="max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{localize("show_only_options")}</DialogTitle>
        </DialogHeader>

        <div className="mb-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)}>
            {localize("set_all")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll(false)}>
            {localize("clear_all")}
          </Button>
          {showStemPresets ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setHebrewAramaic(HEBREW_STEMS)}>
                {localize("set_hebrew")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setHebrewAramaic(ARAMAIC_STEMS)}>
                {localize("set_aramaic")}
              </Button>
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-x-6 gap-y-1">
          {grid.map((col, c) => (
            <div key={c} className="space-y-0.5">
              {col.map((e) => (
                <label key={e.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="hideFeatures"
                    checked={checked[e.value] === true}
                    onChange={(ev) => setChecked((prev) => ({ ...prev, [e.value]: ev.target.checked }))}
                  />
                  {e.label}
                </label>
              ))}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {localize("cancel_button")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              const hidden: string[] = [];
              for (const e of entries) if (checked[e.value] !== true) hidden.push(e.value);
              onSave(hidden);
            }}
          >
            {localize("save_button")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}