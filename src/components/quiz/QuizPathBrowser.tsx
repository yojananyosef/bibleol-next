"use client";

// QuizPathBrowser.tsx — navegador de ejercicios (select_quiz 1:1 con
// Mod_quizpath::dirlist). Navega directorios y arranca quizzes.

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { listQuizDirAction } from "@/app/actions/quizpath";
import type { DirList } from "@/lib/services/quizpath";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function QuizPathBrowser({ root, defaultDb, teacher }: { root: string; defaultDb?: string; teacher?: boolean }) {
  const [dir, setDir] = useState(root);
  const [listing, setListing] = useState<DirList | null>(null);
  const [count, setCount] = useState("10");
  const [pending, startTransition] = useTransition();

  const refresh = useCallback((path: string) => {
    startTransition(async () => {
      const res = await listQuizDirAction(path);
      if (res.ok && res.data) {
        setListing(res.data);
        setDir(res.data.relativedir);
      } else if (res.error) {
        setListing({ directories: [], files: [], parentdir: null, relativedir: path, is_empty: {} });
        window.alert(res.error);
      }
    });
  }, []);

  useEffect(() => {
    refresh(root);
  }, [refresh, root]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{dir === "" ? "/" : dir}</p>
          {teacher && defaultDb ? (
            <Link href={`/quiz/editor?dir=${encodeURIComponent(dir)}&db=${encodeURIComponent(defaultDb)}`}>
              <Button type="button" size="sm" variant="outline">
                New exercise
              </Button>
            </Link>
          ) : null}
        </div>
        <ul className="mb-4 divide-y rounded border">
          {listing?.parentdir !== null && listing?.parentdir !== undefined ? (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => refresh(listing!.parentdir!)}
              >
                ↑ ..
              </button>
            </li>
          ) : null}
          {listing?.directories.map(([name, maySee]) => (
            <li key={name}>
              {maySee ? (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => refresh(name === "." ? dir : `${dir}${dir ? "/" : ""}${name}`)}
                >
                  {listing.is_empty[name] ? "▫" : "▸"} {name}/
                </button>
              ) : (
                <span className="block px-3 py-2 text-sm text-muted-foreground">▫ {name}/</span>
              )}
            </li>
          ))}
          {listing?.files.map((f) => (
            <li key={f.filename} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 truncate text-sm">{f.filename}</span>
              <Input
                className="h-8 w-16"
                inputMode="numeric"
                aria-label="Number of questions"
                defaultValue={count}
                onBlur={(e) => setCount(e.target.value)}
              />
              <Link
                href={`/quiz/universe?quiz=${encodeURIComponent(`${dir}${dir ? "/" : ""}${f.filename}`)}&count=${count}`}
              >
                <Button type="button" size="sm">
                  Start
                </Button>
              </Link>
              {teacher ? (
                <Link href={`/quiz/editor?quiz=${encodeURIComponent(`${dir}${dir ? "/" : ""}${f.filename}`)}`}>
                  <Button type="button" size="sm" variant="outline">
                    Edit
                  </Button>
                </Link>
              ) : null}
            </li>
          ))}
          {pending && !listing ? <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li> : null}
        </ul>
        {listing && listing.files.length === 0 && listing.directories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exercises here.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
