"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormStatus } from "react-dom";
import type { TranslateResult } from "./trans-editor";

export interface LexRow {
  key: string;
  tally: string;
  lex: string;
  lexeme: string;
  stem: string;
  strongs: string;
  partOfSpeech: string;
  first: { href: string; label: string } | null;
  textShow: string;
  textEdit: string;
  /** true si esta fila repite lexema (heb/aram): tally/lex/lexeme vacíos. */
  repeat: boolean;
}

interface Props {
  srcLang: string;
  rows: LexRow[];
  submitLabel: string;
  action: (prev: TranslateResult | null, formData: FormData) => Promise<TranslateResult>;
  children?: React.ReactNode;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** view_translate.php case 'lexicon' (tabla de glosas + revert/modif). */
export function LexEditor({ srcLang, rows, submitLabel, action, children }: Props) {
  const [modifs, setModifs] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const originals = useRef<Record<string, string>>({});

  const setOkay = (key: string) => {
    const original = originals.current[key];
    const current = values[key];
    if (original !== undefined && current === original) {
      setModifs({ ...modifs, [key]: "false" });
    } else {
      setModifs({ ...modifs, [key]: "true" });
    }
  };

  const onChange = (key: string, v: string) => {
    if (originals.current[key] === undefined) originals.current[key] = values[key] !== undefined ? values[key] : (rows.find((x) => x.key === key)?.textEdit ?? "");
    setValues({ ...values, [key]: v });
    setOkay(key);
  };

  const revert = (key: string) => {
    if (originals.current[key] !== undefined) setValues({ ...values, [key]: originals.current[key] });
    setModifs({ ...modifs, [key]: "false" });
  };

  const revertAll = () => {
    const v: Record<string, string> = {};
    const m: Record<string, string> = {};
    for (const r of rows) {
      if (originals.current[r.key] !== undefined) v[r.key] = originals.current[r.key];
      m[r.key] = "false";
    }
    setValues(v);
    setModifs(m);
  };

  const anyModif = Object.values(modifs).some((x) => x === "true");

  return (
    <form action={action as never} className="space-y-1">
      {children}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-2 text-left">Occurrences</th>
              {(srcLang === "heb" || srcLang === "aram") && (
                <>
                  <th className="p-2 text-left">Symbolic lexeme</th>
                  <th className="p-2 text-left">Lexeme</th>
                  <th className="p-2 text-left">Stem</th>
                </>
              )}
              {srcLang === "greek" && <th className="p-2 text-left">Strong&rsquo;s</th>}
              {srcLang === "latin" && <th className="p-2 text-left">Part of speech</th>}
              <th className="p-2 text-left">First occurrence</th>
              <th className="p-2 text-left">Show</th>
              <th className="p-2 text-left">Edit</th>
              <th className="p-2 text-left">Modified</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const value = values[r.key] !== undefined ? values[r.key] : r.textEdit ?? "";
              return (
                <tr key={r.key} className="border-b align-top">
                  <td className="p-2 text-center">{r.repeat ? "" : r.tally}</td>
                  {(srcLang === "heb" || srcLang === "aram") && (
                    <>
                      <td className="p-2">{r.repeat ? "" : r.lex}</td>
                      <td className="p-2 rtl" dir="rtl">
                        {r.repeat ? <span>&nbsp;&nbsp;&#x2033;</span> : r.lexeme}
                      </td>
                      <td className="p-2">{r.stem}</td>
                    </>
                  )}
                  {srcLang === "greek" && <td className="p-2 text-center">{r.strongs}</td>}
                  {srcLang === "latin" && <td className="p-2 text-center">{r.partOfSpeech}</td>}
                  <td className="p-2">
                    {r.first && (
                      <a href={r.first.href} target="_blank" className="text-primary underline-offset-4 hover:underline">
                        {r.first.label}
                      </a>
                    )}
                  </td>
                  <td className="max-w-[16rem] whitespace-pre-wrap break-words p-2">{r.textShow}</td>
                  <td className="p-2">
                    <Input
                      name={r.key}
                      defaultValue={value}
                      onChange={(e) => onChange(r.key, e.target.value)}
                      className="min-w-[18rem]"
                    />
                    <input type="hidden" name={`modif-${r.key}`} value={modifs[r.key] ?? "false"} />
                  </td>
                  <td className="p-2 text-center">
                    {modifs[r.key] === "true" && (
                      <button
                        type="button"
                        onClick={() => revert(r.key)}
                        className="text-xs text-red-600 underline-offset-2 hover:underline"
                      >
                        Revert
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        {anyModif && (
          <button type="button" onClick={revertAll} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            Revert all
          </button>
        )}
      </div>
    </form>
  );
}
