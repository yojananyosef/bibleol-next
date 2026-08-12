"use client";

// mql-panel.tsx — Port de `BibleOL/ts/paneltemplmql.ts` (PanelTemplMql) a
// React. Un único componente sirve para el tab "sentences" (sensel) y el tab
// "sentence units" (qosel), con la misma semántica que las subclases legacy
// PanelTemplSentenceSelector / PanelTemplQuizObjectSelector:
//  - sensel ofrece el checkbox "Use for sentence unit selection" (useForQo),
//  - el MQL del sensel se envuelve en "[ <object> NORETRIEVE ... ]",
//  - el cambio de objeto (o de useForQo) repuebla el tab de Features.

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getConfiguration,
  getFeatureSetting,
  getObjectSetting,
  getTypeInfo,
} from "@/legacy-ts/configuration";
import {
  localize,
  getFeatureFriendlyName,
  getObjectFriendlyName,
  getFeatureValueFriendlyName,
} from "@/legacy-ts/localization";
import { StringWithSort } from "@/legacy-ts/stringwithsort";
import {
  EditorEnumFeatureHandler,
  EditorEnumListFeatureHandler,
  EditorFeatureHandler,
  EditorIntegerFeatureHandler,
  EditorListValuesHandler,
  EditorMqlData,
  EditorQereFeatureHandler,
  EditorRangeIntegerFeatureHandler,
  EditorStringFeatureHandler,
  VerbClassSelection,
  columnsFor,
  editorHandlerOf,
  verbClassRows,
} from "@/lib/quiz/editor-logic";
import type { FeatureHandler as WireFeatureHandler } from "@/lib/quiz/template-parser";
import { Button } from "@/components/ui/button";

export interface MqlSelectorPanelHandle {
  /** getInfo(): selección como EditorMqlData (1:1 con PanelTemplMql::getInfo). */
  getInfo(): EditorMqlData;
  /** isDirty(): el MQL generado difiere del inicial. */
  isDirty(): boolean;
  /** setOtype + setUsemql + setMql del legacy (importación desde SHEBANQ). */
  importFromShebanq(otype: string, mql: string): void;
}

/** Resultado de la importación SHEBANQ aplicable al selector de unidades. */
export interface ShebanqImportResult {
  sentence_unit: string | null;
  sentence_unit_mql: string | null;
}

export interface MqlSelectorPanelProps {
  prefix: "sensel" | "qosel";
  initialMd: EditorMqlData | null;
  /** Solo en el selector de frases: checkbox "use for sentence unit selection". */
  allowUseForQo: boolean;
  onUseForQoChange: (v: boolean) => void;
  /** El tipo de objeto cambió: repoblar el tab de Features. */
  onOtypeChanged: (otype: string) => void;
  onChanged: () => void;
  /** Cambio de MQL ↔ friendly (el sensel habilita el tab de unidades). */
  onMqlModeChange: (useMql: boolean) => void;
  /** Solo sensel: la importación SHEBANQ devolvió una unidad de frase. */
  onShebanqImport?: (r: ShebanqImportResult) => void;
}

interface PanelState {
  useMql: boolean;
  mqlText: string;
  otype: string;
  currentFeature: string;
  handlers: Record<string, EditorFeatureHandler>;
  featureList: string[];
}

/** Crea un handler vacío según el tipo de la feature (generate*Panel). */
function newHandlerFor(otype: string, key: string, valueType: string): EditorFeatureHandler {
  const cfg = getConfiguration();
  if (valueType === "integer") {
    return getFeatureSetting(otype, key).isRange
      ? new EditorRangeIntegerFeatureHandler(key)
      : new EditorIntegerFeatureHandler(key);
  }
  if (valueType === "ascii" || valueType === "string") {
    const isQere =
      (cfg.propertiesName === "ETCBC4" && key === "qere_utf8") ||
      (cfg.propertiesName === "ETCBC4-translit" && key === "qere_translit");
    return isQere ? new EditorQereFeatureHandler(key) : new EditorStringFeatureHandler(key);
  }
  if (valueType.startsWith("list of ")) return new EditorEnumListFeatureHandler(key);
  return new EditorEnumFeatureHandler(key);
}

/**
 * Reconstruye los handlers del objeto actual (1:1 con objectSelectionUpdated +
 * el uso de fname2fh del legacy). `initialRaw` son los handlers del fichero
 * (solo se usan con el objeto inicial).
 */
function makeHandlers(
  otype: string,
  initialRaw: Record<string, WireFeatureHandler>,
): { handlers: Record<string, EditorFeatureHandler>; featureList: string[]; defaultFeature: string } {
  const handlers: Record<string, EditorFeatureHandler> = {};
  const featureList: string[] = [];
  let defaultFeature = "";

  const featuresetting = getObjectSetting(otype).featuresetting ?? {};

  for (const key of Object.keys(featuresetting)) {
    const valueType = getTypeInfo().obj2feat?.[otype]?.[key];
    if (valueType === undefined) continue;
    const featset = getFeatureSetting(otype, key);

    // Ignore features that cannot be used for selection
    if (featset.ignoreSelect) continue;

    featureList.push(key);
    const initial = initialRaw[key];
    handlers[key] = initial ? editorHandlerOf(initial) : newHandlerFor(otype, key, valueType);
    if (featset.isDefault && defaultFeature === "") defaultFeature = key;
  }

  return { handlers, featureList, defaultFeature };
}

/** makeMql(): convierte el selector friendly a MQL (AND; el sensel lo envuelve). */
function makeMql(otype: string, handlers: Record<string, EditorFeatureHandler>, prefix: string): string {
  const inner = Object.values(handlers)
    .filter((h) => h.hasValues())
    .map((h) => h.toMql())
    .join(" AND ");
  if (prefix === "sensel") return `[${otype} NORETRIEVE ${inner}]`;
  return inner;
}

export const MqlSelectorPanel = forwardRef<MqlSelectorPanelHandle, MqlSelectorPanelProps>(
  function MqlSelectorPanel(
    { prefix, initialMd, allowUseForQo, onUseForQoChange, onOtypeChanged, onChanged, onMqlModeChange, onShebanqImport },
    ref,
  ) {
    const cfg = getConfiguration();

    // Parámetros iniciales (finish_construct del legacy)
    const init = useMemo(() => {
      const fname2fh: Record<string, WireFeatureHandler> = {};
      if (initialMd?.featHand?.vhand) {
        for (const vh of initialMd.featHand.vhand) {
          const w = vh as unknown as WireFeatureHandler;
          fname2fh[w.name] = w;
        }
      }

      let useMql: boolean;
      let otype: string;
      let handlers: Record<string, EditorFeatureHandler>;
      let featureList: string[];
      let defaultFeature: string;

      if (initialMd === null || initialMd.mql === null) {
        // Ejercicio nuevo o selector friendly
        useMql = false;
        otype = initialMd !== null ? initialMd.object : cfg.objHasSurface;
        const built = makeHandlers(otype, fname2fh);
        handlers = built.handlers;
        featureList = built.featureList;
        defaultFeature = built.defaultFeature;
      } else {
        // Ejercicio existente con selector MQL
        useMql = true;
        otype = initialMd.object;
        const built = makeHandlers(otype, fname2fh);
        handlers = built.handlers;
        featureList = built.featureList;
        defaultFeature = built.defaultFeature;
      }

      const mqlText = useMql ? initialMd!.mql! : makeMql(otype, handlers, prefix);

      return {
        initialMqlText: mqlText,
        initialUseForQo: initialMd !== null && initialMd.useForQo,
        state: { useMql, mqlText, otype, currentFeature: defaultFeature, handlers, featureList } as PanelState,
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [state, setState] = useState<PanelState>(init.state);
    const [useForQoState, setUseForQoState] = useState<boolean>(
      init.initialUseForQo || (allowUseForQo && initialMd === null),
    );
    const initialMqlText = useRef(init.initialMqlText);

    // Diálogo "Import from SHEBANQ" (import_from_shebanq del legacy)
    const [shebanqOpen, setShebanqOpen] = useState(false);
    const [shebanqQid, setShebanqQid] = useState("");
    const [shebanqDbvers, setShebanqDbvers] = useState("4b");
    const [shebanqError, setShebanqError] = useState("");
    const [shebanqBusy, setShebanqBusy] = useState(false);

    async function doShebanqImport(): Promise<void> {
      setShebanqBusy(true);
      setShebanqError("");
      try {
        const res = await fetch(
          `/shebanq?id=${encodeURIComponent(shebanqQid.trim())}&version=${encodeURIComponent(shebanqDbvers.trim())}`,
        );
        const result = (await res.json()) as {
          error: string | null;
          sentence_mql: string | null;
          sentence_unit: string | null;
          sentence_unit_mql: string | null;
        };
        if (result.error !== null) {
          setShebanqError(result.error);
        } else {
          // panelSent.setMql(sentence_mql): solo el textarea del selector de frases
          if (result.sentence_mql !== null) {
            setState((prev) => ({ ...prev, mqlText: result.sentence_mql! }));
          }
          setShebanqOpen(false);
          onShebanqImport?.({ sentence_unit: result.sentence_unit, sentence_unit_mql: result.sentence_unit_mql });
        }
      } catch (err) {
        setShebanqError(`${localize("error_response")} ${String(err)}`);
      } finally {
        setShebanqBusy(false);
      }
    }

    // --------------------------------------------------------------- helpers

    const hand = (name: string): EditorFeatureHandler => state.handlers[name];

    function initFname2fh(): Record<string, WireFeatureHandler> {
      const map: Record<string, WireFeatureHandler> = {};
      if (initialMd?.featHand?.vhand) {
        for (const vh of initialMd.featHand.vhand) {
          const w = vh as unknown as WireFeatureHandler;
          map[w.name] = w;
        }
      }
      return map;
    }

    const rebuild = (otype: string, useInitial: boolean) => {
      const initialRaw = useInitial ? initFname2fh() : {};
      const built = makeHandlers(otype, initialRaw);
      setState((prev) => ({
        ...prev,
        otype,
        handlers: built.handlers,
        featureList: built.featureList,
        currentFeature: built.defaultFeature,
        mqlText: makeMql(otype, built.handlers, prefix),
      }));
    };

    // getInfo()/isDirty() imperativos (save/test del orquestador)
    useImperativeHandle(ref, () => ({
      getInfo(): EditorMqlData {
        const info: EditorMqlData = {
          object: state.otype,
          mql: null,
          featHand: null,
          useForQo: allowUseForQo ? useForQoState : false,
        };
        if (state.useMql) info.mql = state.mqlText;
        else info.featHand = { vhand: Object.values(state.handlers).filter((h) => h.hasValues()) };
        return info;
      },
      isDirty(): boolean {
        return state.mqlText !== initialMqlText.current;
      },
      importFromShebanq(otype: string, mql: string): void {
        // setOtype().change() + setUsemql() + setMql() del legacy
        rebuild(otype, false);
        setState((prev) => ({ ...prev, useMql: true, mqlText: mql }));
        onMqlModeChange(true);
      },
    }));

    // switchToMql(): para sensel, deselecciona useForQo (el tab de unidades
    // queda entonces habilitado) — 1:1 con PanelTemplSentenceSelector.
    const switchToMql = (useMql: boolean) => {
      if (useMql && allowUseForQo && useForQoState) {
        setUseForQoState(false);
        onUseForQoChange(false);
      }
      setState((prev) => ({ ...prev, useMql }));
      onMqlModeChange(useMql);
    };

    // Se cambió el tipo de objeto: resetear selectores (handler del combo).
    const onOtypeSelect = (otype: string) => {
      rebuild(otype, false);
      onOtypeChanged(otype);
    };

    // ------------------------------------------------------------- rendering

    return (
      <>
        <div className="space-y-3 text-sm">
        {allowUseForQo ? (
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={useForQoState}
                disabled={state.useMql}
                onCheckedChange={(v) => {
                  const nv = v === true;
                  setUseForQoState(nv);
                  onUseForQoChange(nv);
                  onChanged();
                }}
              />
              {localize("use_for_qosel")}
            </Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setShebanqOpen(true)}>
              {localize("import_shebanq")}
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2">
          <Label className="flex items-center gap-2 font-normal">
            <input
              type="radio"
              name={`${prefix}_usemql`}
              checked={state.useMql}
              onChange={() => switchToMql(true)}
            />
            {localize("mql_qosel_prompt")}
          </Label>
          <Textarea
            disabled={!state.useMql}
            className="min-h-16 font-mono text-xs"
            value={state.mqlText}
            onChange={(e) => {
              setState((prev) => ({ ...prev, mqlText: e.target.value }));
              onChanged();
            }}
          />
        </div>

        <Label className="flex items-center gap-2 font-normal">
          <input
            type="radio"
            name={`${prefix}_usemql`}
            checked={!state.useMql}
            onChange={() => {
              switchToMql(false);
              onChanged();
            }}
          />
          {localize("friendly_featsel_prompt")}
        </Label>

        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
          <Label className="text-muted-foreground">{localize("sentence_unit_type_prompt")}</Label>
          <select
            className="h-8 rounded border bg-background px-2 text-sm"
            disabled={state.useMql}
            value={state.otype}
            onChange={(e) => onOtypeSelect(e.target.value)}
          >
            {Object.keys(getConfiguration().objectSettings)
              .filter((s) => getObjectSetting(s).mayselect)
              .map((s) => (
                <option key={s} value={s}>
                  {getObjectFriendlyName(s)}
                </option>
              ))}
          </select>

          <Label className="text-muted-foreground">{localize("feature_prompt")}</Label>
          <select
            className="h-8 rounded border bg-background px-2 text-sm"
            disabled={state.useMql}
            value={state.currentFeature}
            onChange={(e) => setState((prev) => ({ ...prev, currentFeature: e.target.value }))}
          >
            {state.featureList.map((key) => (
              <option key={key} value={key}>
                {getFeatureFriendlyName(state.otype, key)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-start gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              // 'Clear': friendly + objeto con superficie
              setState((prev) => ({ ...prev, useMql: false }));
              onMqlModeChange(false);
              rebuild(cfg.objHasSurface, false);
              onOtypeChanged(cfg.objHasSurface);
            }}
          >
            {localize("clear_button")}
          </Button>
          <div className="min-h-12 flex-1">
            {state.currentFeature !== "" && !state.useMql ? (
              <FeatureSelectorGroup
                key={`${state.otype}:${state.currentFeature}`}
                prefix={prefix}
                otype={state.otype}
                keyName={state.currentFeature}
                valueType={getTypeInfo().obj2feat?.[state.otype]?.[state.currentFeature] ?? ""}
                handler={hand(state.currentFeature)}
                onChanged={() => {
                  // updateMql(): regenera el textarea con el MQL friendly
                  setState((prev) => ({ ...prev, mqlText: makeMql(state.otype, state.handlers, prefix) }));
                  onChanged();
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Import from SHEBANQ dialog (view_edit_quiz.php #import-shebanq-dialog) */}
      {allowUseForQo ? (
        <Dialog open={shebanqOpen} onOpenChange={(o) => !o && setShebanqOpen(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{localize("import_from_shebanq")}</DialogTitle>
            </DialogHeader>
            {shebanqError ? (
              <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {shebanqError}
              </p>
            ) : null}
            <div className="space-y-3">
              <div>
                <Label htmlFor={`${prefix}-shebanq-qid`} className="mb-1 block text-sm">
                  {localize("shebanq_query_id_prompt")}
                </Label>
                <Input
                  id={`${prefix}-shebanq-qid`}
                  value={shebanqQid}
                  onChange={(e) => setShebanqQid(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void doShebanqImport();
                  }}
                />
              </div>
              <div>
                <Label htmlFor={`${prefix}-shebanq-dbvers`} className="mb-1 block text-sm">
                  {localize("shebanq_query_id_prompt")}
                </Label>
                <Input
                  id={`${prefix}-shebanq-dbvers`}
                  value={shebanqDbvers}
                  onChange={(e) => setShebanqDbvers(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void doShebanqImport();
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShebanqOpen(false)}>
                {localize("cancel_button")}
              </Button>
              <Button type="button" onClick={() => void doShebanqImport()} disabled={shebanqBusy}>
                {localize("import_button")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      </>
    );
  },
);

// ---------------------------------------------------------------------------
// FeatureSelectorGroup: el selector de una feature según su tipo de valor
// ---------------------------------------------------------------------------

function FeatureSelectorGroup({
  prefix,
  otype,
  keyName,
  valueType,
  handler,
  onChanged,
}: {
  prefix: string;
  otype: string;
  keyName: string;
  valueType: string;
  handler: EditorFeatureHandler;
  onChanged: () => void;
}) {
  if (valueType === "integer") {
    if (getFeatureSetting(otype, keyName).isRange)
      return <IntegerRangePanel handler={handler as EditorRangeIntegerFeatureHandler} onChanged={onChanged} />;
    return <IntegerPanel handler={handler as EditorIntegerFeatureHandler} onChanged={onChanged} />;
  }
  if (valueType === "ascii" || valueType === "string") {
    if (handler.type === "qerefeature")
      return <QerePanel handler={handler as EditorQereFeatureHandler} onChanged={onChanged} />;
    return (
      <StringPanel
        prefix={prefix}
        keyName={keyName}
        handler={handler as EditorStringFeatureHandler}
        onChanged={onChanged}
      />
    );
  }
  if (valueType.startsWith("list of "))
    return <EnumListPanel handler={handler as EditorEnumListFeatureHandler} valueType={valueType} onChanged={onChanged} />;
  return (
    <EnumPanel
      prefix={prefix}
      otype={otype}
      keyName={keyName}
      handler={handler as EditorEnumFeatureHandler}
      valueType={valueType}
      onChanged={onChanged}
    />
  );
}

/** Radios =/≠ [~/~] para un feature. */
function ComparatorRadios({
  name,
  handler,
  showMatches,
  onChanged,
}: {
  name: string;
  handler: EditorFeatureHandler;
  showMatches: boolean;
  onChanged: () => void;
}) {
  return (
    <span className="mr-2 inline-flex items-center gap-1">
      <input
        type="radio"
        name={name}
        value="equals"
        checked={handler.comparator === "equals"}
        onChange={() => {
          handler.setComparator("equals");
          onChanged();
        }}
      />
      =
      <input
        type="radio"
        name={name}
        value="differs"
        checked={handler.comparator === "differs"}
        onChange={() => {
          handler.setComparator("differs");
          onChanged();
        }}
      />
      ≠
      {showMatches ? (
        <>
          <input
            type="radio"
            name={name}
            value="matches"
            checked={handler.comparator === "matches"}
            onChange={() => {
              handler.setComparator("matches");
              onChanged();
            }}
          />
          ~
        </>
      ) : null}
    </span>
  );
}

function IntegerRangePanel({
  handler,
  onChanged,
}: {
  handler: EditorRangeIntegerFeatureHandler;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-1">
      <RangeRow label={localize("low_value_prompt")} handler={handler} which="value_low" onChanged={onChanged} />
      <RangeRow label={localize("high_value_prompt")} handler={handler} which="value_high" onChanged={onChanged} />
    </div>
  );
}

function RangeRow({
  label,
  handler,
  which,
  onChanged,
}: {
  label: string;
  handler: EditorRangeIntegerFeatureHandler;
  which: "value_low" | "value_high";
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  const val = which === "value_low" ? handler.value_low : handler.value_high;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="text"
        size={8}
        className="h-7 rounded border bg-background px-2"
        value={val ?? ""}
        onChange={(e) => {
          const s = e.target.value;
          setError("");
          if (s.length === 0) handler.set_low_high(which, null);
          else if (s.match(/\D/g) !== null) setError(localize("not_integer"));
          else handler.set_low_high(which, +s);
          onChanged();
        }}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function IntegerPanel({ handler, onChanged }: { handler: EditorIntegerFeatureHandler; onChanged: () => void }) {
  return (
    <div>
      <ComparatorRadios name={`int_${handler.name}`} handler={handler} showMatches={false} onChanged={onChanged} />
      <div className="space-y-1">
        {handler.values.map((v, i) => (
          <IntegerRow key={i} handler={handler} index={i} value={v} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function IntegerRow({
  handler,
  index,
  value,
  onChanged,
}: {
  handler: EditorIntegerFeatureHandler;
  index: number;
  value: number | null;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        size={8}
        className="h-7 rounded border bg-background px-2"
        value={value ?? ""}
        onChange={(e) => {
          const s = e.target.value;
          setError("");
          if (s.length === 0) handler.removeValue(index);
          else if (s.match(/\D/g) !== null) setError(localize("not_integer"));
          else handler.setValue(index, +s);
          onChanged();
        }}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function StringPanel({
  prefix,
  keyName,
  handler,
  onChanged,
}: {
  prefix: string;
  keyName: string;
  handler: EditorStringFeatureHandler;
  onChanged: () => void;
}) {
  return (
    <div>
      <ComparatorRadios name={`${prefix}_${keyName}_comp`} handler={handler} showMatches onChanged={onChanged} />
      <div className="space-y-1">
        {handler.values.map((v, i) => (
          <input
            key={i}
            type="text"
            size={20}
            className="h-7 rounded border bg-background px-2"
            value={v ?? ""}
            onChange={(e) => {
              const s = e.target.value;
              if (s.length === 0) handler.removeValue(i);
              else handler.setValue(i, s);
              onChanged();
            }}
          />
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1"
        onClick={() => {
          handler.values.push(null);
          handler.normalize();
          onChanged();
        }}
      >
        {localize("add_entry_button")}
      </Button>
    </div>
  );
}

function QerePanel({ handler, onChanged }: { handler: EditorQereFeatureHandler; onChanged: () => void }) {
  return (
    <Label className="flex items-center gap-2 font-normal">
      <Checkbox
        checked={handler.omit}
        onCheckedChange={(v) => {
          handler.setValue(v === true);
          onChanged();
        }}
      />
      {localize("omit_qere")}
    </Label>
  );
}

/** Panel "list of ..." (verb classes): 4 "choices" con filas de radios. */
function EnumListPanel({
  handler,
  valueType,
  onChanged,
}: {
  handler: EditorEnumListFeatureHandler;
  valueType: string;
  onChanged: () => void;
}) {
  const stripped = valueType.substring(8);
  const enumValues = getTypeInfo().enum2values?.[stripped] ?? [];

  const [tab, setTab] = useState(0);
  const labels = [localize("1st_choice"), localize("2nd_choice"), localize("3rd_choice"), localize("4th_choice")];

  return (
    <div>
      <div className="mb-1 flex gap-2">
        {labels.map((lab, i) => (
          <Button key={lab} type="button" variant={tab === i ? "default" : "outline"} size="sm" onClick={() => setTab(i)}>
            {lab}
          </Button>
        ))}
      </div>
      <VerbClassTable lv={handler.listvalues[tab]} enumValues={enumValues} valueType={stripped} onChanged={onChanged} />
    </div>
  );
}

function VerbClassTable({
  lv,
  enumValues,
  valueType,
  onChanged,
}: {
  lv: EditorListValuesHandler;
  enumValues: string[];
  valueType: string;
  onChanged: () => void;
}) {
  const rows = verbClassRows(enumValues, valueType, lv);

  const selOf = (name: string): VerbClassSelection => {
    if (lv.yes_values.indexOf(name) !== -1) return VerbClassSelection.YES;
    if (lv.no_values.indexOf(name) !== -1) return VerbClassSelection.NO;
    return VerbClassSelection.DONT_CARE;
  };

  const selVal = (sel: VerbClassSelection): "yes" | "no" | "dontcare" =>
    sel === VerbClassSelection.YES ? "yes" : sel === VerbClassSelection.NO ? "no" : "dontcare";

  return (
    <table className="w-auto border-separate border-spacing-x-3 text-sm">
      <thead>
        <tr>
          <th>{localize("verb_class_yes")}</th>
          <th>{localize("verb_class_no")}</th>
          <th>{localize("verb_class_dont_care")}</th>
          <th className="text-left">{localize("verb_class")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            {(["yes", "no", "dontcare"] as const).map((selName) => (
              <td key={selName}>
                <input
                  type="radio"
                  name={`vc_${row.name}`}
                  value={selName}
                  checked={selVal(selOf(row.name)) === selName}
                  onChange={(e) => {
                    if (e.target.checked) {
                      lv.modifyValue(row.name, selName);
                      onChanged();
                    }
                  }}
                />
              </td>
            ))}
            <td className="text-left">{row.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Panel de enumeración: radios =/≠ + grid de checkboxes ordenado. */
function EnumPanel({
  prefix,
  otype,
  keyName,
  handler,
  valueType,
  onChanged,
}: {
  prefix: string;
  otype: string;
  keyName: string;
  handler: EditorEnumFeatureHandler;
  valueType: string;
  onChanged: () => void;
}) {
  const enumValues = getTypeInfo().enum2values?.[valueType] ?? [];
  const featset = getFeatureSetting(otype, keyName);

  const entries: { value: string; label: string }[] = [];
  for (const s of enumValues) {
    const hv = featset.hideValues;
    const ov = featset.otherValues;
    if ((hv && hv.indexOf(s) !== -1) || (ov && ov.indexOf(s) !== -1)) continue;
    entries.push({ value: s, label: getFeatureValueFriendlyName(valueType, s, false, false) });
  }

  const sws = entries.map((e) => ({ e, sws: new StringWithSort(e.label, e.value) }));
  sws.sort((a, b) => StringWithSort.compare(a.sws, b.sws));

  const columns = columnsFor(sws.length);
  const rows = Math.ceil(sws.length / columns);
  const grid: (typeof sws)[number][][] = [];
  for (let c = 0; c < columns; ++c) {
    const col: (typeof sws)[number][] = [];
    for (let r = 0; r < rows; ++r) {
      const ix = c * rows + r;
      if (ix < sws.length) col.push(sws[ix]);
    }
    grid.push(col);
  }

  return (
    <div>
      <ComparatorRadios name={`${prefix}_${keyName}_comp`} handler={handler} showMatches={false} onChanged={onChanged} />
      <div className="grid grid-cols-3 gap-x-6">
        {grid.map((col, c) => (
          <div key={c} className="space-y-0.5">
            {col.map(({ e, sws: s }) => (
              <Label key={e.value} className="flex items-center gap-2 font-normal">
                <input
                  type="checkbox"
                  name={`${prefix}_${keyName}`}
                  value={e.value}
                  checked={handler.values.indexOf(e.value) !== -1}
                  onChange={(ev) => {
                    if (ev.target.checked) handler.addValue(e.value);
                    else handler.removeValue(e.value);
                    onChanged();
                  }}
                />
                {s.getString()}
              </Label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}