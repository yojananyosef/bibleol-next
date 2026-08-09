"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Charset } from "@/lib/reader/charset";
import {
  indentationIndicator,
  type DisplayBox,
  type DisplayTree,
  type DisplayWord,
  type GrammarPanelFeature,
  type GrammarPanelLevel,
} from "@/lib/reader/display";
import type { ReaderL10n, ReaderObjectSettings, ReaderTypeInfo, SentenceGrammar } from "@/lib/reader/sentencegrammar";
import { getSentenceGrammarFor } from "@/lib/reader/sentencegrammar";
import { grammarInfoTable, type GrammarInfoRow } from "@/lib/reader/grammar-info";
import { GrammarPanel } from "@/components/text/grammar-panel";
import { GrammarDialog } from "@/components/text/grammar-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import "./grammar-display.css";

export interface GrammarBoxProps {
  /** Nombre de la base de datos (clave de sessionStorage; p.ej. "ETCBC4"). */
  db: string;
  tree: DisplayTree;
  panel: GrammarPanelLevel[];
  charset: Charset;
  databaseName: string;
  grammar: SentenceGrammar[];
  l10n: ReaderL10n;
  typeinfo: ReaderTypeInfo;
  objectSettings: ReaderObjectSettings;
  objHasSurface: string;
  surfaceFeature: string;
}

type Prefs = Record<string, boolean | number>;

function loadPrefs(storageKey: string): Prefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw !== null) return JSON.parse(raw) as Prefs;
  } catch {
    // Sin preferencias previas
  }
  return {};
}

/**
 * Vista de gramática (port de DisplayMonadObject.generateHtml + FollowerBox
 * de util.ts). Replica 1:1 el HTML del legacy; el estado de cada checkbox se
 * guarda en sessionStorage con la misma clave que el legacy.
 */
export function GrammarBox({
  db,
  tree,
  panel,
  charset,
  databaseName,
  grammar,
  l10n,
  typeinfo,
  objectSettings,
  objHasSurface,
  surfaceFeature,
}: GrammarBoxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(db));
  const [indentWidth, setIndentWidth] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialog, setDialog] = useState<{ heading: string; rows: GrammarInfoRow[] } | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(db, JSON.stringify(prefs));
    } catch {
      // Almacenamiento no disponible
    }
  }, [prefs, db]);

  const etcb4 = databaseName === "ETCBC4";
  const checked = (checkboxId: string) => prefs[checkboxId] === true;
  const toggle = (checkboxId: string, value: boolean) => setPrefs((p) => ({ ...p, [checkboxId]: value }));

  const tabShown = etcb4 && checked("clause_atom_tab_cb");

  // FollowerBox: las features marcan implícitamente su caja (border/seplin/wordspace)
  const wordFeaturesChecked = (panel[0]?.groups ?? []).some((g) =>
    g.features.some((f) => f.implicit === "wordspace" && checked(f.checkboxId)),
  );
  const featuresAt = (level: number, implicit: GrammarPanelFeature["implicit"]) =>
    (panel.find((p) => p.level === level)?.groups ?? []).some((g) =>
      g.features.some((f) => f.implicit === implicit && checked(f.checkboxId)),
    );

  const borderShown = (level: number) => checked(`lev${level}_sb_cb`) || featuresAt(level, "border");
  const seplinShown = (level: number) => checked(`lev${level}_seplin_cb`) || (tabShown && level === 2);
  const wordSpaceShown = checked("ws_cb") || wordFeaturesChecked;

  const implicitActive = (checkboxId: string) => {
    const m = checkboxId.match(/^lev(\d+)_(seplin|sb)_cb$/);
    if (m !== null) {
      const level = Number(m[1]);
      return m[2] === "seplin" ? tabShown && level === 2 : featuresAt(level, "border");
    }
    if (checkboxId === "ws_cb") return wordFeaturesChecked;
    return false;
  };

  const colorLimit = Number(prefs["color-limit"] ?? 9999);
  const setColorLimit = (value: number) => setPrefs((p) => ({ ...p, "color-limit": value }));

  const clear = () => {
    setPrefs((p) => {
      const next: Prefs = { ...p };
      for (const key of Object.keys(next)) next[key] = false;
      next["color-limit"] = 9999;
      return next;
    });
  };

  const openObject = (objType: string, features: Record<string, string> | null) => {
    if (features === null) return;
    const sengram = getSentenceGrammarFor(grammar, objType);
    if (sengram === null) return;
    const info = grammarInfoTable(
      sengram,
      features,
      l10n,
      typeinfo,
      { objectSettings, objHasSurface, surfaceFeature },
      { setHead: true, hideWord: false },
    );
    setDialog({ heading: info.heading, rows: info.rows });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const renderWord = (w: DisplayWord): ReactNode => {
    const cont =
      w.cont === null
        ? ""
        : w.cont === "cont"
          ? wordSpaceShown
            ? " cont cont2"
            : " cont cont1"
          : wordSpaceShown
            ? " contx cont2x"
            : " contx cont1";
    const colorized = w.frequencyRank !== null && !Number.isNaN(colorLimit) && w.frequencyRank > colorLimit ? " colorized" : "";
    return (
      <Fragment key={w.idd}>
        <span className={`textblock ${wordSpaceShown ? "inlineblock" : "inline"}`}>
          <span
            className={`textdisplay ${charset.foreignClass}${cont}${colorized}`}
            data-idd={w.idd}
            role="button"
            tabIndex={0}
            onClick={() => openObject("word", w.features)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") openObject("word", w.features);
            }}
          >
            {w.verse !== null && <span className="verse">{w.verse}</span>}
            {w.text}
          </span>
          {w.wordgrammar.map((g) => (
            <span
              key={g.featName}
              className={`wordgrammar ${checked(`word_${g.featName}_cb`) ? "showit" : "dontshowit"} ${g.featName} ${g.wordclass}`}
            >
              {g.value}
            </span>
          ))}
        </span>
        {w.cont === null && <span className="wordspace"> </span>}
      </Fragment>
    );
  };

  const renderBox = (box: DisplayBox): ReactNode => {
    const isPatriarch = box.level === panel.length - 1;
    const border = borderShown(box.level);
    const seplin = seplinShown(box.level);
    let spanClass = `lev${box.level} ${border ? "showborder" : "dontshowborder"} ${seplin ? "seplin" : "noseplin"}`;
    if (box.hasp) spanClass += " hasp";
    if (box.hass) spanClass += " hass";
    if (!box.dummy && !isPatriarch) spanClass += " notdummy";

    return (
      <span key={`${box.objType}-${box.lo}-${box.hi}`} data-idd={box.idd} className={spanClass}>
        {!isPatriarch &&
          (box.dummy ? (
            <span className="nogram dontshowit" data-idd={box.idd} data-mix={box.mix} />
          ) : (
            <span
              className={`gram ${border ? "showit" : "dontshowit"}`}
              data-idd={box.idd}
              data-mix={box.mix}
              role="button"
              tabIndex={0}
              onClick={() => openObject(box.objType, box.features)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openObject(box.objType, box.features);
              }}
            >
              {box.shortName}
              {box.grammar.map((g) => (
                <span
                  key={`${g.objType}_${g.featName}`}
                  className={`xgrammar ${checked(`${g.objType}_${g.featName}_cb`) ? "showit" : "dontshowit"} ${g.objType}_${g.featName}`}
                >
                  :{g.value}
                </span>
              ))}
            </span>
          ))}
        {etcb4 && box.level === 2 && box.indent !== null && (
          <span
            className={`xgrammar clause_atom_tab ${tabShown ? "showit" : "dontshowit"} indentation`}
            data-indent={box.indent}
          >
            {tabShown ? indentationIndicator(box.indent, tree.indentMin, tree.indentMax) : ""}
          </span>
        )}
        {box.children.map((child) => (child.kind === "word" ? renderWord(child) : renderBox(child)))}
      </span>
    );
  };

  // adjustDivLevWidth (grammarselectionbox.ts): el ancho del div se ajusta a la etiqueta .gram
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const el of root.querySelectorAll<HTMLElement>(".showborder.notdummy")) {
      const gram = el.querySelector<HTMLElement>(":scope > .gram");
      if (gram === null) continue;
      const w = gram.getBoundingClientRect().width;
      if (el.offsetWidth < w + 10) el.style.width = `${w + 10}px`;
    }
  });

  // Medición del ancho de los indicadores de sangría (boxes + 2 nbsp)
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !etcb4 || !tabShown) return;
    const probe = document.createElement("span");
    probe.className = "indentation";
    probe.style.whiteSpace = "nowrap";
    probe.textContent = indentationIndicator(tree.indentMin, tree.indentMin, tree.indentMax);
    root.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    setIndentWidth(Math.round(w));
  }, [etcb4, tabShown, tree.indentMin, tree.indentMax]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setPanelOpen(true)}>
          Grammar options
        </Button>
      </div>

      <div
        ref={rootRef}
        dir={charset.isRtl ? "rtl" : "ltr"}
        className={`grammar-display ${charset.isRtl ? "rtl" : "ltr"}${tabShown && etcb4 ? " etcb4-tab" : ""}`}
        style={tabShown && etcb4 && indentWidth > 0 ? ({ "--indent-w": `${indentWidth}px` } as CSSProperties) : undefined}
      >
        {renderBox(tree.root)}
      </div>

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Grammar options</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <GrammarPanel
              panel={panel}
              checked={checked}
              implicitActive={implicitActive}
              colorLimit={colorLimit}
              onToggle={toggle}
              onColorLimit={setColorLimit}
              onClear={clear}
            />
          </div>
        </SheetContent>
      </Sheet>

      <GrammarDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        heading={dialog?.heading ?? ""}
        rows={dialog?.rows ?? []}
      />
    </div>
  );
}
