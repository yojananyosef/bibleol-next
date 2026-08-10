"use client";

// universe-tab.tsx — Tab "Passages" del editor de ejercicios (1:1 con el
// div#tab_universe de view_edit_quiz.php): árbol de pasajes en modo editor +
// maylocate + contexto de oraciones + número fijo de preguntas + orden.

import { useState } from "react";
import { PassageTree } from "@/components/quiz/PassageTree";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { localize } from "@/legacy-ts/localization";

export interface UniverseTabProps {
  treeJson: string;
  markedList: string[];
  prop: string;
  maylocate: boolean;
  sentbefore: string;
  sentafter: string;
  fixedquestions: string;
  randomize: boolean;
  onMaylocateChange: (v: boolean) => void;
  onSentbeforeChange: (v: string) => void;
  onSentafterChange: (v: string) => void;
  onFixedquestionsChange: (v: string) => void;
  onRandomizeChange: (v: boolean) => void;
  onRefsChange: (refs: string[]) => void;
}

export function UniverseTab({
  treeJson,
  markedList,
  prop,
  maylocate,
  sentbefore,
  sentafter,
  fixedquestions,
  randomize,
  onMaylocateChange,
  onSentbeforeChange,
  onSentafterChange,
  onFixedquestionsChange,
  onRandomizeChange,
  onRefsChange,
}: UniverseTabProps) {
  const [fqError, setFqError] = useState("");

  const optionSelect = (value: string, count: number, onChange: (v: string) => void): React.ReactNode => (
    <select
      className="h-8 rounded border bg-background px-2"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {Array.from({ length: count }, (_, i) => (
        <option key={i} value={i}>
          {i}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <PassageTree
        quizPath=""
        count={0}
        treeJson={treeJson}
        markedList={markedList}
        prop={prop}
        editorMode
        onRefsChange={onRefsChange}
      />

      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={maylocate}
          onCheckedChange={(v) => {
            onMaylocateChange(v === true);
          }}
        />
        {localize("may_locate")}
      </Label>

      <div className="flex items-center gap-3 text-sm">
        <span>{localize("context_sentences")}</span>
        <span className="flex items-center gap-1">
          {localize("sent_before")}
          {optionSelect(sentbefore, 6, onSentbeforeChange)}
        </span>
        <span className="flex items-center gap-1">
          {localize("sent_after")}
          {optionSelect(sentafter, 2, onSentafterChange)}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span>{localize("fixed_questions")}</span>
        <input
          type="text"
          size={8}
          className="h-8 rounded border bg-background px-2"
          value={fixedquestions}
          onChange={(e) => {
            const s = e.target.value;
            setFqError("");
            if (s.length !== 0 && /\D/.test(s)) setFqError(localize("not_integer"));
            onFixedquestionsChange(s);
          }}
        />
        {fqError ? <span className="text-xs text-destructive">{fqError}</span> : null}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span>{localize("question_order")}</span>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="randomize"
            checked={randomize}
            onChange={() => onRandomizeChange(true)}
          />
          {localize("question_order_random")}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="randomize"
            checked={!randomize}
            onChange={() => onRandomizeChange(false)}
          />
          {localize("question_order_fixed")}
        </label>
      </div>
    </div>
  );
}