"use client";

// QuizRunner.tsx — Envoltura React del port legacy `Quiz`/`PanelQuestion`
// (BibleOL/ts/quiz.ts + panelquestion.ts 1:1). Implementa QuizUi y PanelUi;
// el estado de corrección vive en ComponentWithYesNo / InputHandle.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Quiz, type QuizUi } from "@/legacy-ts/quiz";
import {
  PanelQuestion,
  Cursor,
  type QuizCardModel,
  type QuizRow,
  type QuizRowBody,
  type PanelUi,
  type RadioOption,
  type ForeignLetter,
} from "@/legacy-ts/panelquestion";
import { serverDictionaryToLegacy, type DictionaryIf } from "@/legacy-ts/dictionary";
import { initLocalization, type Localization, type LocalizationGeneral } from "@/legacy-ts/localization";
import { initConfiguration, getTypeInfo, type Configuration } from "@/legacy-ts/configuration";
import { initQuizData, type QuizData } from "@/legacy-ts/quizdata";
import { makeCharset } from "@/lib/reader/charset";
import { enhanceSentenceGrammar } from "@/lib/reader/sentencegrammar";
import type { DisplayCtx } from "@/legacy-ts/displaymonadobject";
import type { ReaderSentenceGrammar } from "@/lib/reader/sentencegrammar";
import { updateExamQuizStatAction, updateStatAction } from "@/app/actions/statistics";
import type { EndQuizPayload } from "@/lib/services/statistics";
import { Button } from "@/components/ui/button";

export interface QuizRunnerProps {
  quizDataJson: string;
  dictionariesJson: string;
  dbinfoJson: string;
  l10nJson: string;
  l10nJsJson: string;
  typeinfoJson: string;
  timeSeconds: number | null;
  isUnlimited: boolean;
  numberSmallQuestions: number;
  isExam: boolean;
  examid?: number;
  exerciseLst?: string;
  quizName?: string;
}

export function QuizRunner(props: QuizRunnerProps) {
  const router = useRouter();

  const quizRef = useRef<Quiz | null>(null);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const [desc, setDesc] = useState("");
  const [progressText, setProgressText] = useState("");
  const [progressVal, setProgressVal] = useState(0);
  const [showPrev, setShowPrev] = useState(false);
  const [nextDisabled, setNextDisabled] = useState(true);
  const [finishDisabled, setFinishDisabled] = useState(true);
  const [info, setInfo] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("Unlimited");
  const [showLocation, setShowLocation] = useState(true);
  const sendingRef = useRef(false);

  const panelRef = useRef<PanelQuestion | null>(null);
  const subQuizIndexRef = useRef(0);

  // ------------------------------------------------------------------ setup
  useEffect(() => {
    const config = JSON.parse(props.dbinfoJson) as Configuration;
    const l10n = JSON.parse(props.l10nJson) as Localization;
    const l10nJs = JSON.parse(props.l10nJsJson) as LocalizationGeneral;
    const typeinfo = JSON.parse(props.typeinfoJson) as never;

    initConfiguration(config, typeinfo);
    initLocalization(l10n, l10nJs);

    const qd = JSON.parse(props.quizDataJson) as QuizData;
    initQuizData(qd, true);

    const dictif: DictionaryIf = serverDictionaryToLegacy(JSON.parse(props.dictionariesJson));

    const charset = makeCharset(config.charSet);
    const ctx: DisplayCtx = {
      l10n,
      typeinfo: getTypeInfo(),
      charset,
      sentencegrammar: enhanceSentenceGrammar(config.sentencegrammar as never as ReaderSentenceGrammar[]),
      siteUrl: "/",
      surfaceFeature: config.surfaceFeature,
      suffixFeature: config.suffixFeature,
    };

    const ui: QuizUi = {
      hidePrevQuestion: () => setShowPrev(false),
      showPrevQuestion: () => setShowPrev(true),
      disableNext: () => setNextDisabled(true),
      enableNext: () => setNextDisabled(false),
      enableFinish: () => setFinishDisabled(false),
      disableFinish: () => setFinishDisabled(true),
      setProgress: (i, max) => setProgressVal(max > 0 ? i / max : 0),
      setProgressText: (text) => setProgressText(text),
      setDesc: (html) => setDesc(html),
      scrollToQuestion: () => window.scrollTo({ top: 0 }),
      navigateTo: (url) => router.push(url),
      showError: (message) => setInfo(`error: ${message}`),
      showSendingStatistics: () => setInfo("sending_statistics"),
      alert: (message) => window.alert(message),
      sendStatistics: async (statistics) => {
        try {
          await updateStatAction(statistics as unknown as EndQuizPayload);
        } catch (err) {
          throw new Error(String(err));
        }
        if (props.isExam) {
          const statisticsForExam = statistics as unknown as { quizid: number };
          await updateExamQuizStatAction(
            props.examid ?? 0,
            statisticsForExam.quizid,
            props.exerciseLst ?? "",
          );
          const lst = props.exerciseLst ?? "";
          if (lst) {
            const parts = lst.split("~");
            const next = parts.shift();
            const rest = parts.join("~");
            router.push(
              `/quiz/run?quiz=${encodeURIComponent(next ?? "")}&count=10&examid=${props.examid}&exercise_lst=${encodeURIComponent(rest)}`,
            );
          } else {
            router.push("/exams/done");
          }
          return true;
        }
        router.push("/quiz");
        return true;
      },
    };

    const quiz = new Quiz(qd.quizid, props.isExam, qd, dictif, ui, ctx, charset, l10n, getTypeInfo());
    quizRef.current = quiz;
    quiz.nextQuestion(true);
    refreshPanel(quiz);

    // Timer (view_text_display.php 1:1: total = number_small_questions * time_seconds)
    if (!props.isUnlimited && props.timeSeconds !== null) {
      const totalTime = props.numberSmallQuestions * props.timeSeconds;
      const deadline = Date.now() / 1000 + totalTime;
      const interval = setInterval(() => {
        const left = deadline - Date.now() / 1000;
        if (left < 0) {
          clearInterval(interval);
          setTimeLeft("0m 0s");
          if (!sendingRef.current) finishQuiz(true);
        } else {
          const minutes = Math.floor(left / 60);
          const seconds = Math.floor(left % 60);
          setTimeLeft(`${minutes}m ${seconds}s`);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ panel

  function refreshPanel(quiz: Quiz): void {
    const panel = quiz.currentPanel;
    panelRef.current = panel;
    if (panel) {
      subQuizIndexRef.current = panel.subQuizIndex;
      panel.ui = makePanelUi(quiz);
    }
    Cursor.onChange = () => bump();
    bump();
  }

  function makePanelUi(quiz: Quiz): PanelUi {
    return {
      prevSubQuiz: () => {
        quiz.currentPanel?.prevNextSubQuestion(-1);
        subQuizIndexRef.current = quiz.currentPanel?.subQuizIndex ?? 0;
        bump();
      },
      nextSubQuiz: () => {
        quiz.currentPanel?.prevNextSubQuestion(1);
        subQuizIndexRef.current = quiz.currentPanel?.subQuizIndex ?? 0;
        bump();
      },
      isPrevSubQuizVisible: () => (quiz.currentPanel?.subQuizIndex ?? 0) > 0,
      isNextSubQuizVisible: () =>
        (quiz.currentPanel?.subQuizIndex ?? 0) + 1 < (quiz.currentPanel?.subQuizMax ?? 1),
      nextQuestion: () => {
        quiz.nextQuestion(false);
        refreshPanel(quiz);
      },
      checkAnswer: () => {
        quiz.currentPanel?.checkAnswerButton();
        bump();
      },
      showAnswer: () => {
        quiz.currentPanel?.showAnswerButton();
        bump();
      },
      toggleShortcuts: () => undefined,
      focusCurrent: () => undefined,
      blurCurrent: () => undefined,
      isChecked: (id) => {
        const panel = quiz.currentPanel;
        if (!panel) return false;
        const card = panel.cards[panel.subQuizIndex];
        for (const row of card.rows) {
          if (row.body.kind === "suggestions" || row.body.kind === "select") {
            const opt = row.body.options.find((o) => o.inputId === id);
            if (opt) return row.comp.handle.getValue() === opt.sws.getInternal();
          }
          if (row.body.kind === "checkboxes") {
            const opt = row.body.options.find((o) => id.startsWith(o.internal + "_"));
            if (opt) return (row.comp.handle.getCheckedValues?.() ?? []).includes(opt.internal);
          }
        }
        return false;
      },
      setChecked: (id) => {
        const panel = quiz.currentPanel;
        if (!panel) return;
        const card = panel.cards[panel.subQuizIndex];
        for (const row of card.rows) {
          if (row.body.kind === "suggestions" || row.body.kind === "select") {
            const opt = row.body.options.find((o) => o.inputId === id);
            if (opt) {
              row.comp.handle.setCheckedValues?.([opt.sws.getInternal()]);
              row.comp.onChange();
              bump();
              return;
            }
          }
        }
      },
      clickElement: (id) => {
        const panel = quiz.currentPanel;
        if (!panel) return;
        const card = panel.cards[panel.subQuizIndex];
        for (const row of card.rows) {
          if (row.body.kind !== "textForeign") continue;
          const current = row.comp.handle.getValue();
          if (id === row.body.backspaceId) {
            row.comp.handle.setValue(current.slice(0, -1));
            row.comp.onChange();
            bump();
            return;
          }
          const letter = row.body.letters.find((l) => l.id === id);
          if (letter) {
            row.comp.handle.setValue(current + letter.letter);
            row.comp.onChange();
            bump();
            return;
          }
        }
      },
      toggleElement: (id) => {
        const panel = quiz.currentPanel;
        if (!panel) return;
        const card = panel.cards[panel.subQuizIndex];
        for (const row of card.rows) {
          if (row.body.kind !== "checkboxes") continue;
          const opt = row.body.options.find((o) => id.startsWith(o.internal + "_"));
          if (!opt) continue;
          const checked = row.comp.handle.getCheckedValues?.() ?? [];
          const next = checked.includes(opt.internal)
            ? checked.filter((v) => v !== opt.internal)
            : [...checked, opt.internal];
          row.comp.handle.setCheckedValues?.(next);
          row.comp.onChange();
          bump();
          return;
        }
      },
    };
  }

  // ------------------------------------------------------------------ actions

  function handlePrev(): void {
    quizRef.current?.prevQuestion();
    refreshPanel(quizRef.current!);
  }

  function handleNext(): void {
    quizRef.current?.nextQuestion(false);
    refreshPanel(quizRef.current!);
  }

  function finishQuiz(grading: boolean): void {
    if (sendingRef.current) return;
    sendingRef.current = true;
    quizRef.current?.finishQuiz(grading);
  }

  // ------------------------------------------------------------------ render

  const panel = panelRef.current;
  const subQuizIndex = subQuizIndexRef.current;
  const card: QuizCardModel | undefined = panel?.cards[subQuizIndex];

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const p = panelRef.current;
    if (!p) return;
    if (p.handleBodyKeydown({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey })) e.preventDefault();
  };

  const onTextKeyDown = (e: React.KeyboardEvent): void => {
    const p = panelRef.current;
    if (!p) return;
    if (p.handleTextFieldKeydown({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey })) e.preventDefault();
  };

  const onRowInputChange = (row: QuizRow, value: string): void => {
    row.comp.handle.setValue(value);
    row.comp.onChange();
    bump();
  };

  const onCheckedChange = (row: QuizRow, values: string[]): void => {
    row.comp.handle.setCheckedValues?.(values);
    row.comp.onChange();
    bump();
  };

  const onRadioChange = (row: QuizRow, internal: string): void => {
    row.comp.handle.setCheckedValues?.([internal]);
    row.comp.onChange();
    bump();
  };

  const yesNoIcon = (row: QuizRow): string => {
    const s = row.comp.getState();
    if (s === "yes") return "✓";
    if (s === "no") return "✗";
    return "";
  };

  const renderForeignLetters = (body: Extract<QuizRowBody, { kind: "textForeign" }>): React.ReactNode => {
    return (
      <div className="flex flex-wrap gap-1">
        {body.letters.map((l: ForeignLetter) => (
          <button
            key={l.id || l.letter}
            type="button"
            className="h-8 min-w-8 rounded border px-1 text-base hover:bg-accent"
            onClick={() => {
              const row = currentRow(body);
              if (row) {
                row.comp.handle.setValue(row.comp.handle.getValue() + l.letter);
                row.comp.onChange();
                bump();
              }
            }}
          >
            <span className={l.charClass}>{l.letter}</span>
          </button>
        ))}
        <button
          type="button"
          className="h-8 min-w-8 rounded border px-1 hover:bg-accent"
          onClick={() => {
            const row = currentRow(body);
            if (row) {
              row.comp.handle.setValue(row.comp.handle.getValue().slice(0, -1));
              row.comp.onChange();
              bump();
            }
          }}
        >
          ←
        </button>
      </div>
    );
  };

  const currentRow = (body: QuizRowBody): QuizRow | undefined => {
    const p = panelRef.current;
    if (!p) return undefined;
    return p.cards[p.subQuizIndex].rows.find((r) => r.body === body);
  };

  const headerClass = `border bg-muted/40 px-2 py-1 align-middle text-sm font-medium`;

  const renderRowBody = (row: QuizRow, rowIndex: number): React.ReactNode => {
    const body = row.body;
    const rowSelected = Cursor.row === rowIndex && Cursor.card === subQuizIndex;
    const cellClass = `border px-2 py-1 align-middle ${rowSelected ? "bg-accent/40" : ""}`;

    switch (body.kind) {
      case "textPlain":
        return (
          <td className={cellClass}>
            <span className={body.charClass} dangerouslySetInnerHTML={{ __html: body.value }} />
          </td>
        );
      case "text":
        return (
          <td className={cellClass}>
            <input
              id={body.keyinpId}
              className="h-9 w-56 rounded border bg-background px-2 text-sm"
              value={row.comp.handle.getValue()}
              onKeyDown={onTextKeyDown}
              onChange={(e) => onRowInputChange(row, e.target.value)}
            />
          </td>
        );
      case "integer":
        return (
          <td className={cellClass}>
            <input
              type="number"
              className="h-9 w-40 rounded border bg-background px-2 text-sm"
              value={row.comp.handle.getValue()}
              onKeyDown={onTextKeyDown}
              onChange={(e) => onRowInputChange(row, e.target.value)}
            />
          </td>
        );
      case "textForeign":
        return (
          <td className={cellClass}>
            <div className="flex flex-col gap-1">
              <input
                className="h-9 w-72 rounded border bg-background px-2 text-sm"
                value={row.comp.handle.getValue()}
                onKeyDown={onTextKeyDown}
                onChange={(e) => onRowInputChange(row, e.target.value)}
              />
              {renderForeignLetters(body)}
            </div>
          </td>
        );
      case "suggestions":
        return (
          <td className={cellClass}>
            <div className="flex flex-col gap-1">
              {body.options.map((opt: RadioOption) => {
                const checked = row.comp.handle.getValue() === opt.sws.getInternal();
                return (
                  <label key={opt.inputId} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={row.rowId}
                      checked={checked}
                      onChange={() => onRadioChange(row, opt.sws.getInternal())}
                    />
                    <span className={opt.charClass}>{opt.sws.getString()}</span>
                  </label>
                );
              })}
            </div>
          </td>
        );
      case "select":
        return (
          <td className={cellClass}>
            <select
              className="h-9 w-full rounded border bg-background px-2 text-sm"
              value={row.comp.handle.getValue()}
              onChange={(e) => onRadioChange(row, e.target.value)}
            >
              <option value=""></option>
              {body.options.map((opt: RadioOption) => (
                <option key={opt.inputId} value={opt.sws.getInternal()}>
                  {opt.sws.getString()}
                </option>
              ))}
            </select>
          </td>
        );
      case "checkboxes":
        return (
          <td className={cellClass}>
            <div className="grid grid-cols-3 gap-1">
              {body.options.map((opt) => {
                const checked = (row.comp.handle.getCheckedValues?.() ?? []).includes(opt.internal);
                return (
                  <label key={opt.internal} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const cur = row.comp.handle.getCheckedValues?.() ?? [];
                        onCheckedChange(
                          row,
                          checked ? cur.filter((v) => v !== opt.internal) : [...cur, opt.internal],
                        );
                      }}
                    />
                    <span dangerouslySetInnerHTML={{ __html: opt.label }} />
                  </label>
                );
              })}
            </div>
          </td>
        );
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6" onKeyDown={onKeyDown}>
      {/* Header: locate + timer */}
      <div className="mb-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showLocation} onChange={(e) => setShowLocation(e.target.checked)} />
          {props.quizName ?? "Quiz"}
        </label>
        <span className="rounded bg-muted px-3 py-1 text-sm">
          {showLocation && panel ? <span className="font-bold uppercase">{panel.location}</span> : null}
          <span className="ml-3 tabular-nums">{timeLeft}</span>
        </span>
      </div>

      {/* Info (sending / error) */}
      {info === "sending_statistics" ? (
        <div className="mb-3 rounded border bg-muted p-3 text-sm">Sending statistics…</div>
      ) : info !== null && info.startsWith("error:") ? (
        <div className="mb-3 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {info.slice(6)}
        </div>
      ) : null}

      {/* Progress */}
      <div className="mb-1 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${progressVal * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums">{progressText}</span>
      </div>

      {/* Description */}
      {desc ? (
        <div className="mb-3 rounded border bg-muted/40 p-3 text-sm" dangerouslySetInnerHTML={{ __html: desc }} />
      ) : null}

      {/* Question panel */}
      {card ? (
        <table className="mb-4 w-full border-collapse">
          <tbody>
            {card.rows.map((row, i) => (
              <tr key={row.rowId}>
                <td className={headerClass} dangerouslySetInnerHTML={{ __html: row.header }} />
                {renderRowBody(row, i)}
                <td className="w-6 border px-1 text-center text-sm">{yesNoIcon(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mb-4 rounded border p-6 text-sm text-muted-foreground">Loading…</div>
      )}

      {/* Sub-quiz navigation */}
      {(panel?.subQuizMax ?? 1) > 1 ? (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={subQuizIndex === 0}
            onClick={() => {
              panel?.prevNextSubQuestion(-1);
              subQuizIndexRef.current = panel?.subQuizIndex ?? 0;
              bump();
            }}
          >
            « Previous item
          </Button>
          <span className="tabular-nums">
            Item {subQuizIndex + 1} of {panel?.subQuizMax ?? 1}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={subQuizIndex + 1 >= (panel?.subQuizMax ?? 1)}
            onClick={() => {
              panel?.prevNextSubQuestion(1);
              subQuizIndexRef.current = panel?.subQuizIndex ?? 0;
              bump();
            }}
          >
            Next item »
          </Button>
        </div>
      ) : null}

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {showPrev ? (
          <Button type="button" variant="outline" onClick={handlePrev}>
            Previous question
          </Button>
        ) : null}
        <Button type="button" disabled={nextDisabled} onClick={handleNext}>
          Next question
        </Button>
        <Button type="button" variant="outline" onClick={() => panel?.checkAnswerButton()}>
          Check answer
        </Button>
        <Button type="button" variant="outline" onClick={() => panel?.showAnswerButton()}>
          Show answer
        </Button>
        <Button type="button" variant="default" disabled={finishDisabled} onClick={() => finishQuiz(true)}>
          {props.isExam ? "Finish section" : "GRADE task"}
        </Button>
        {!props.isExam ? (
          <Button type="button" variant="ghost" disabled={finishDisabled} onClick={() => finishQuiz(false)}>
            SAVE outcome
          </Button>
        ) : null}
      </div>
    </div>
  );
}
