"use client";

// Selector de ejercicios (1:1 con el modal del file_manager legacy): nombre
// del examen + checkboxes de .3et navegando los directorios de data/quizzes.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createExamAction, getDirContentsAction } from "@/app/actions/exams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DirContents = { relativedir: string; parentdir: string | null; dirs: string[]; files: string[] };

export function NewExamForm() {
  const router = useRouter();
  const [dir, setDir] = useState("");
  const [data, setData] = useState<DirContents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");

  useEffect(() => {
    getDirContentsAction(dir).then((res) => {
      if (res.ok && res.data) setData(res.data as DirContents);
      else setError(res.error ?? "unknown error");
    });
  }, [dir]);

  const toggle = (file: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      const full = dir === "" ? file : `${dir}/${file}`;
      if (next.has(full)) next.delete(full);
      else next.add(full);
      return next;
    });
  };

  const submit = async (fd: FormData): Promise<void> => {
    const res = await createExamAction(fd);
    if (res.ok) router.push("/exams");
    else setError(res.error ?? "unknown error");
  };

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="examname" value={name} />
      {[...selected].map((f) => (
        <input key={f} type="hidden" name="file" value={f} />
      ))}
      <div>
        <Label htmlFor="examname">Exam name</Label>
        <Input id="examname" value={name} onChange={(e) => setName(e.target.value)} placeholder="My exam" required />
      </div>

      <div className="rounded border p-3">
        <p className="mb-2 text-sm font-medium">
          Exercises{data ? ` — ${data.relativedir === "" ? "/" : `/${data.relativedir}`}` : ""}
        </p>
        {data?.parentdir !== null && data?.parentdir !== undefined && (
          <button type="button" className="mb-1 text-sm text-muted-foreground hover:underline" onClick={() => setDir(data.parentdir ?? "")}>
            ← {data.parentdir === "" ? ".." : data.parentdir}
          </button>
        )}
        {!data && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && data.dirs.length === 0 && data.files.length === 0 && (
          <p className="text-sm text-muted-foreground">No exercises here.</p>
        )}
        <ul className="space-y-1 text-sm">
          {data?.dirs.map((d) => {
            const target = dir === "" ? d : `${dir}/${d}`;
            return (
              <li key={d} className="flex items-center gap-2">
                <button type="button" className="text-blue-600 hover:underline" onClick={() => setDir(target)}>
                  {d}/
                </button>
              </li>
            );
          })}
          {data?.files.map((f) => {
            const full = dir === "" ? f : `${dir}/${f}`;
            return (
              <li key={f} className="flex items-center gap-2">
                <Input type="checkbox" className="h-4 w-4" checked={selected.has(full)} onChange={() => toggle(f)} />
                <span>{f}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">{selected.size} exercise(s) selected.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/exams")}>Cancel</Button>
        <Button type="submit" disabled={selected.size === 0 || !name.trim()}>Create exam</Button>
      </div>
    </form>
  );
}