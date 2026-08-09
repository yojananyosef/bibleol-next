"use client";

import { useActionState, useEffect } from "react";
import { selectTextAction, type SelectTextActionState } from "@/app/actions/corpus";
import type { DbBooks } from "@/lib/corpus/emdros";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SelectTextForm({ databases }: { databases: DbBooks[] }) {
  const [state, formAction, pending] = useActionState<SelectTextActionState, FormData>(
    selectTextAction,
    null,
  );

  // Muestra el selector de libros del corpus activo y el rango de capítulos
  useEffect(() => {
    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("select.data-book"));
    const hint = document.getElementById("valid_chap");
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>("input.data-radio"));

    const showFor = (db: string) => {
      for (const sel of selects) sel.classList.toggle("hidden", sel.dataset.db !== db);
      const sel = selects.find((s) => s.dataset.db === db);
      if (hint && sel) {
        const chaps = sel.selectedOptions[0]?.dataset.chaps ?? "";
        hint.textContent = chaps ? `(valid chapters ${chaps})` : "";
      }
    };

    const showChaps = (sel: HTMLSelectElement) => {
      const chaps = sel.selectedOptions[0]?.dataset.chaps ?? "";
      if (hint) hint.textContent = chaps ? `(valid chapters ${chaps})` : "";
    };

    for (const sel of selects) {
      sel.addEventListener("change", () => showChaps(sel));
    }
    for (const radio of radios) {
      radio.addEventListener("change", () => showFor(radio.value));
    }
    const checked = radios.find((r) => r.checked);
    if (checked) showFor(checked.value);
    else showFor(databases[0]?.name ?? "");
    return () => {
      for (const sel of selects) sel.removeEventListener("change", () => {});
      for (const radio of radios) radio.removeEventListener("change", () => {});
    };
  }, [databases]);

  return (
    <Card className="w-full max-w-lg self-start">
      <CardHeader>
        <CardTitle>Make a selection</CardTitle>
      </CardHeader>
      <CardContent>
        {state?.error && (
          <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <form action={formAction} className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-medium">Corpus</legend>
            {databases.map((db, i) => (
              <label key={db.name} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="db"
                  value={db.name}
                  defaultChecked={i === 0}
                  className="data-radio"
                />
                {db.loc_desc}
              </label>
            ))}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="bookname">Book</Label>
            {databases.map((db) => (
              <select
                key={db.name}
                name={`book_${db.name}`}
                id="bookname"
                data-db={db.name}
                className="data-book hidden w-full rounded border bg-background px-2 py-1.5 text-sm"
                defaultValue={db.order[0]?.[0] ?? ""}
              >
                {db.order.map(([book, chaps]) => (
                  <option key={book} value={book} data-chaps={chaps}>
                    {db.loc_books[book] ?? book}
                  </option>
                ))}
              </select>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chapter">Chapter</Label>
              <Input id="chapter" name="chapter" defaultValue="1" inputMode="numeric" />
              <small className="block text-xs text-muted-foreground" id="valid_chap" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vfrom">First verse</Label>
              <Input id="vfrom" name="vfrom" inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vto">Last verse</Label>
              <Input id="vto" name="vto" inputMode="numeric" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="showicons" value="on" />
            Show link icons
          </label>

          <Button type="submit" disabled={pending}>
            Display
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
