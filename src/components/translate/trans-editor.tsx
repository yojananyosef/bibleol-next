"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFormStatus } from "react-dom";

export interface TransRow {
  key: string;
  symbolic: string;
  comment: string;
  textShow: string;
  textEdit: string;
  textarea: boolean;
}

interface Props {
  rows: TransRow[];
  submitLabel: string;
  action: (prev: TranslateResult, formData: FormData) => Promise<TranslateResult>;
  children?: React.ReactNode;
}

export interface TranslateResult {
  error?: string;
  ok?: true;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** view_translate.php (JS): revert per line, revert all, modif-indicator. */
export function TransEditor({ rows, submitLabel, action, children }: Props) {
  const [modifs, setModifs] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const originals = useRef<Record<string, string>>({});

  const setOkay = (key: string) => {
    const original = originals.current[key];
    const current = values[key];
    if (original !== undefined && current === original) {
      const m = { ...modifs, [key]: "false" };
      setModifs(m);
    } else {
      setModifs({ ...modifs, [key]: "true" });
    }
  };

  const onChange = (key: string, v: string) => {
    if (originals.current[key] === undefined) originals.current[key] = values[key] !== undefined ? values[key] : firstOriginal(key);
    setValues({ ...values, [key]: v });
    setOkay(key);
  };

  const firstOriginal = (key: string): string => {
    const r = rows.find((x) => x.key === key);
    return r ? r.textEdit ?? "" : "";
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
              <th className="p-2 text-left">Key</th>
              <th className="p-2 text-left">Comment</th>
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
                  <td className="p-2">{r.symbolic}</td>
                  <td className="max-w-[20rem] break-words p-2 text-muted-foreground">{r.comment}</td>
                  <td className="max-w-[16rem] whitespace-pre-wrap break-words p-2">{r.textShow}</td>
                  <td className="p-2">
                    {r.textarea ? (
                      <Textarea
                        name={r.key}
                        defaultValue={value}
                        onChange={(e) => onChange(r.key, e.target.value)}
                        rows={3}
                        className="min-w-[18rem]"
                      />
                    ) : (
                      <Input
                        name={r.key}
                        defaultValue={value}
                        onChange={(e) => onChange(r.key, e.target.value)}
                        className="min-w-[18rem]"
                      />
                    )}
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
