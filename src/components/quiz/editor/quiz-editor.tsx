"use client";

// quiz-editor.tsx — Orquestador del editor de ejercicios (port de
// `BibleOL/ts/editquiz.ts` + `view_edit_quiz.php`).
//
//  - Tabs: Description / Passages / Sentences / Sentence Units / Features /
//    Timer (1:1 con #quiz_tabs; el tab de unidades se habilita cuando la
//    selección de frases deja de usarse también para unidades).
//  - Save y Test Exercise: los diálogos de nombre de archivo y de
//    sobrescritura (check_submit_quiz / submit_quiz / test_quiz).
//  - En lugar de CKEditor se usa un <textarea> (el desc del ejercicio es HTML).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getConfiguration } from "@/legacy-ts/configuration";
import { initConfiguration } from "@/legacy-ts/configuration";
import { initLocalization, localize, type Localization } from "@/legacy-ts/localization";
import type { QuizEditorDataPayload } from "@/lib/services/quizeditor";
import type { EditorMqlData, EditorQuizFeatures } from "@/lib/quiz/editor-logic";
import { checkQuizNameAction, submitQuizAction, testQuizAction } from "@/app/actions/quizeditor";
import { MqlSelectorPanel, type MqlSelectorPanelHandle } from "./mql-panel";
import type { ShebanqImportResult } from "./mql-panel";
import { FeaturesTab, type FeaturesTabHandle } from "./features-tab";
import { UniverseTab } from "./universe-tab";
import { TimerTab, type TimerTabHandle } from "./timer-tab";

/** Forma "legacy" del JSON del editor (la que consume la UI). */
interface EditorDecoded {
  desc: string;
  database: string;
  properties: string;
  selectedPaths: string[];
  sentenceSelection: EditorMqlData;
  quizObjectSelection: EditorMqlData;
  quizFeatures: EditorQuizFeatures;
  maylocate: boolean;
  sentbefore: number;
  sentafter: number;
  fixedquestions: number;
  randomize: boolean;
}

export interface QuizEditorProps {
  data: QuizEditorDataPayload;
  teacher?: boolean;
}

export function QuizEditor({ data, teacher }: QuizEditorProps) {
  const router = useRouter();

  // Configuración global de legacy-ts ANTES de montar los paneles hijos
  const [{ decoded, l10n }] = useState<{ decoded: EditorDecoded; l10n: Localization }>(() => {
    initConfiguration(JSON.parse(data.dbinfo_json), JSON.parse(data.typeinfo_json));
    initLocalization(JSON.parse(data.l10n_json), JSON.parse(data.l10n_js_json));
    return {
      decoded: JSON.parse(data.decoded_3et_json) as EditorDecoded,
      l10n: JSON.parse(data.l10n_json) as Localization,
    };
  });
  const cfg = getConfiguration();

  // --------------------------------------------------------- descripción
  const [desc, setDesc] = useState(decoded.desc);

  // ------------------------------------------------------------ pasajes
  const [selectedRefs, setSelectedRefs] = useState<string[]>(data.markedList);
  const [maylocate, setMaylocate] = useState(decoded.maylocate);
  const [sentbefore, setSentbefore] = useState(String(decoded.sentbefore));
  const [sentafter, setSentafter] = useState(String(decoded.sentafter));
  const [fixedquestions, setFixedquestions] = useState(String(decoded.fixedquestions));
  const [randomize, setRandomize] = useState(decoded.randomize);

  // ------------------------------------------------- selección frases/unidades
  // useForQo: el mismo selector también elige las unidades de frase.
  const [useForQo, setUseForQo] = useState(
    decoded.sentenceSelection.mql === null && decoded.sentenceSelection.useForQo !== false,
  );
  const [senselOtype, setSenselOtype] = useState(decoded.sentenceSelection.object || cfg.objHasSurface);
  const [qoselOtype, setQoselOtype] = useState(decoded.quizObjectSelection.object || cfg.objHasSurface);

  const senselRef = useRef<MqlSelectorPanelHandle>(null);
  const qoselRef = useRef<MqlSelectorPanelHandle>(null);
  const featuresRef = useRef<FeaturesTabHandle>(null);
  const timerRef = useRef<TimerTabHandle>(null);

  // shebanq_to_qo: confirmación de usar el FOCUS como selección de unidades
  const [shebanqUnit, setShebanqUnit] = useState<{ otype: string; mql: string } | null>(null);

  function onShebanqImport(r: ShebanqImportResult): void {
    if (r.sentence_unit && r.sentence_unit_mql) {
      setShebanqUnit({ otype: r.sentence_unit, mql: r.sentence_unit_mql });
    }
  }

  // Question object: el tipo de objeto del tab Features
  const qbOtype = useForQo ? senselOtype : qoselOtype;

  // El tab de unidades de frase se habilita cuando el selector de frases no
  // se usa también para las unidades (MQL activo).
  const unitDisabled = useForQo;

  // -------------------------------------------------------- save / test
  const [showFilename, setShowFilename] = useState(false);
  const [showOverwrite, setShowOverwrite] = useState(false);
  const [filename, setFilename] = useState(data.quiz ?? "");
  const [filenameError, setFilenameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingActionRef = useRef<"save" | "test">("save");
  const quizNameRef = useRef<string>(data.quiz ?? "");
  const isNew = data.is_new;

  const alert = (title: string, text: string): void => window.alert(`${title}:\n${text}`);

  /** Valida el ejercicio y decide el flujo save/test (1:1 con save_quiz/test_quiz). */
  function checkAndContinue(action: "save" | "test"): void {
    if (selectedRefs.length === 0) {
      alert(localize("passage_selection"), localize("no_passages"));
      return;
    }
    if ((featuresRef.current?.noRequestFeatures() ?? false)) {
      alert(localize("feature_specification"), localize("no_request_feature"));
      return;
    }
    if ((featuresRef.current?.noShowFeatures() ?? false)) {
      alert(localize("feature_specification"), localize("no_show_feature"));
      return;
    }

    // Menos de 1 request feature o sin show features: mensajes mostrados arriba
    if (action === "test" && !isNew) {
      void doSubmit(action, data.quiz ?? quizNameRef.current);
      return;
    }
    if (action === "save" && !isNew) {
      // El ejercicio ya tiene nombre: check_submit_quiz directamente (1:1 con
      // el legacy, que omite el diálogo de nombre de archivo).
      void onFilenameSave();
      return;
    }

    pendingActionRef.current = action;
    setFilename(data.quiz ?? "");
    setFilenameError(null);
    setShowFilename(true);
  }

  /** check_submit_quiz: valida el nombre y decide OK/EXISTS/BADNAME. */
  async function onFilenameSave(): Promise<void> {
    const name = filename.trim();
    if (name.length === 0) {
      setFilenameError(localize("missing_filename"));
      return;
    }
    quizNameRef.current = name;

    const res = await checkQuizNameAction(data.dir, name);
    if (res.error) {
      setFilenameError(res.error);
      return;
    }
    switch (res.status) {
      case "OK":
        setShowFilename(false);
        void doSubmit(pendingActionRef.current, name);
        break;
      case "EXISTS":
        setShowFilename(false);
        setShowOverwrite(true);
        break;
      case "BADNAME":
        setFilenameError(localize("badname"));
        break;
    }
  }

  /** Recolecta el ejercicio (1:1 con save_quiz2/test_quiz2) y lo envía. */
  async function doSubmit(action: "save" | "test", name: string): Promise<void> {
    if (busy) return;
    setBusy(true);

    // Buenas prácticas: no nos fiamos del ref del timer aún sin tab visitado
    const minutes = timerRef.current?.getMinutes() ?? 0;
    const seconds = timerRef.current?.getSeconds() ?? 0;

    const fq = Number(fixedquestions);
    const quizdata = JSON.stringify({
      desc,
      database: decoded.database,
      properties: decoded.properties,
      selectedPaths: selectedRefs,
      sentenceSelection: senselRef.current?.getInfo() ?? {
        object: cfg.objHasSurface,
        mql: null,
        featHand: { vhand: [] },
        useForQo: false,
      },
      quizObjectSelection: qoselRef.current?.getInfo() ?? {
        object: cfg.objHasSurface,
        mql: null,
        featHand: { vhand: [] },
        useForQo: false,
      },
      quizFeatures: featuresRef.current?.getInfo() ?? {
        showFeatures: [],
        requestFeatures: [],
        dontShowFeatures: [],
        dontShowObjects: [],
        glosslimit: 0,
      },
      maylocate,
      sentbefore: Number(sentbefore),
      sentafter: Number(sentafter),
      fixedquestions: fq > 0 ? fq : 0,
      randomize,
    });

    try {
      if (action === "save") {
        const res = await submitQuizAction({
          dir: data.dir,
          quiz: name,
          quizdata,
          minutes,
          seconds,
        });
        if (res.ok) {
          router.push(`/quiz?path=${encodeURIComponent(data.dir)}`);
        } else {
          alert("Error", res.error ?? "unknown error");
          setBusy(false);
        }
      } else {
        const res = await testQuizAction({
          dir: data.dir,
          quiz: name,
          quizdata,
          minutes,
          seconds,
        });
        if (res.ok) {
          router.push(`/quiz/test?quiz=${encodeURIComponent(res.quizPath ?? "")}`);
        } else {
          alert("Error", res.error ?? "unknown error");
          setBusy(false);
        }
      }
    } catch (err) {
      alert("Error", String(err));
      setBusy(false);
    }
  }

  // -------------------------------------------------------------- render

  return (
    <div className="space-y-4">
      <Tabs defaultValue="description" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="description">{localize("description")}</TabsTrigger>
          <TabsTrigger value="universe">{localize("passages")}</TabsTrigger>
          <TabsTrigger value="sentences">{localize("sentences")}</TabsTrigger>
          <TabsTrigger value="sentence_units" disabled={unitDisabled}>
            {localize("sentence_units")}
          </TabsTrigger>
          <TabsTrigger value="features">{localize("features")}</TabsTrigger>
          <TabsTrigger value="timer">{localize("timer")}</TabsTrigger>
        </TabsList>

        <TabsContent value="description" keepMounted className="p-2">
          <Label className="mb-1 block text-sm text-muted-foreground">{localize("description")}</Label>
          <Textarea
            className="min-h-[100px] w-full"
            wrap="hard"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </TabsContent>

        <TabsContent value="universe" keepMounted className="p-2">
          <UniverseTab
            treeJson={data.tree_data}
            markedList={data.markedList}
            prop={data.prop}
            maylocate={maylocate}
            sentbefore={sentbefore}
            sentafter={sentafter}
            fixedquestions={fixedquestions}
            randomize={randomize}
            onMaylocateChange={setMaylocate}
            onSentbeforeChange={setSentbefore}
            onSentafterChange={setSentafter}
            onFixedquestionsChange={setFixedquestions}
            onRandomizeChange={setRandomize}
            onRefsChange={setSelectedRefs}
          />
        </TabsContent>

        <TabsContent value="sentences" keepMounted className="p-2">
          <MqlSelectorPanel
            ref={senselRef}
            prefix="sensel"
            initialMd={decoded.sentenceSelection}
            allowUseForQo
            onUseForQoChange={setUseForQo}
            onOtypeChanged={setSenselOtype}
            onChanged={() => undefined}
            onMqlModeChange={() => undefined}
            onShebanqImport={onShebanqImport}
          />
        </TabsContent>

        <TabsContent value="sentence_units" keepMounted className="p-2">
          <MqlSelectorPanel
            ref={qoselRef}
            prefix="qosel"
            initialMd={decoded.quizObjectSelection}
            allowUseForQo={false}
            onUseForQoChange={() => undefined}
            onOtypeChanged={setQoselOtype}
            onChanged={() => undefined}
            onMqlModeChange={() => undefined}
          />
        </TabsContent>

        <TabsContent value="features" keepMounted className="p-2">
          <FeaturesTab
            ref={featuresRef}
            initialQf={decoded.quizFeatures}
            orderFeatures={data.order_features}
            otype={qbOtype}
            l10n={l10n}
            onChanged={() => undefined}
          />
        </TabsContent>

        <TabsContent value="timer" keepMounted className="p-2">
          <TimerTab ref={timerRef} timeSeconds={data.time_seconds} isUnlimited={data.is_unlimited} onChanged={() => undefined} />
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => checkAndContinue("save")} disabled={busy}>
          {localize("save_button")}
        </Button>
        {teacher ? (
          <Button type="button" variant="outline" onClick={() => checkAndContinue("test")} disabled={busy}>
            Test Exercise
          </Button>
        ) : null}
        <Link href={`/quiz?path=${encodeURIComponent(data.dir === "" ? "/" : data.dir)}`}>
          <Button type="button" variant="outline" disabled={busy}>
            {localize("cancel_button")}
          </Button>
        </Link>
      </div>

      {/* Filename dialog (specify_file_name) */}
      <Dialog
        open={showFilename}
        onOpenChange={(o) => {
          if (!o) setShowFilename(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{localize("specify_file_name")}</DialogTitle>
          </DialogHeader>
          {filenameError ? (
            <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              {filenameError}
            </p>
          ) : null}
          <div>
            <Label htmlFor="quiz-filename" className="mb-1 block text-sm">
              {localize("enter_filename_no_3et")}
            </Label>
            <Input
              id="quiz-filename"
              value={filename}
              onChange={(e) => {
                setFilename(e.target.value);
                setFilenameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onFilenameSave();
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowFilename(false)}>
              {localize("cancel_button")}
            </Button>
            <Button type="button" onClick={() => void onFilenameSave()}>
              {localize("save_button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm overwrite dialog (check_overwrite) */}
      <Dialog
        open={showOverwrite}
        onOpenChange={(o) => {
          if (!o) setShowOverwrite(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{localize("overwrite")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">{localize("file_exists_overwrite")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowOverwrite(false)}>
              {localize("no")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowOverwrite(false);
                void doSubmit(pendingActionRef.current, quizNameRef.current);
              }}
            >
              {localize("yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm sentence unit MQL dialog (shebanq_to_qo) */}
      <Dialog open={shebanqUnit !== null} onOpenChange={(o) => !o && setShebanqUnit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{localize("import_from_shebanq")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>{localize("sentence_selection_imported")}</p>
            {shebanqUnit ? (
              <p
                dangerouslySetInnerHTML={{
                  __html: localize("use_qo_selection").replace(
                    "{0}",
                    `<code>[${shebanqUnit.otype} ${shebanqUnit.mql.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}]</code>`,
                  ),
                }}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShebanqUnit(null)}
            >
              {localize("no")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (shebanqUnit) qoselRef.current?.importFromShebanq(shebanqUnit.otype, shebanqUnit.mql);
                setShebanqUnit(null);
              }}
            >
              {localize("yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}