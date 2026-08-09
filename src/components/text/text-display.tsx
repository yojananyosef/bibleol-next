"use client";

import { useMemo } from "react";
import type { MonadObjectJSON } from "@/lib/corpus/dictionary";

export interface TextDisplayProps {
  db: string;
  bookTitle: string | number | null;
  dictionary: {
    bookTitle: string | number | null;
    sentenceSets: string[];
    sentenceSetsQuiz: string[] | null;
    monadObjects: { level: number; objects: MonadObjectJSON[] }[];
  };
  shebanq_link: string | null;
}

interface Word {
  monad: number;
  text: string;
  suffix: string;
  bcv: (string | number)[];
  bcvLoc: string | null;
  features: Record<string, string> | null;
}

/** Extrae los segmentos monad range de "{ 1-39 }" → [1,39] pares. */
function segments(monads: string): [number, number][] {
  return (monads.match(/-?\d+\s*-\s*-?\d+|−?\d+/) ?? []).map((m) => {
    const [a, b] = m.split(/\s*-\s*/);
    return [parseInt(a, 10), b ? parseInt(b, 10) : parseInt(a, 10)];
  });
}

function contains(monads: string, monad: number): boolean {
  return segments(monads).some(([lo, hi]) => monad >= lo && monad <= hi);
}

export function TextDisplay({ db, bookTitle, dictionary, shebanq_link }: TextDisplayProps) {
  const words = useMemo(() => {
    const level0 = dictionary.monadObjects.find((l) => l.level === 0)?.objects ?? [];
    return level0
      .filter((o): o is MonadObjectJSON & { monads: string } => o.kind === "single")
      .map((o) => ({
        monad: parseInt(o.monads.match(/-?\d+/)?.[0] ?? "0", 10),
        text: o.text ?? "",
        suffix: o.suffix ?? " ",
        bcv: o.bcv ?? [],
        bcvLoc: o.bcv_loc ?? null,
        features: o.features,
      }));
  }, [dictionary]);

  // Nivel 3 (sentence): agrupamos las palabras por frase para párrafos
  const sentences = useMemo(() => {
    const level3 = dictionary.monadObjects.find((l) => l.level === 3)?.objects ?? [];
    const groups: { monads: string; words: Word[] }[] = [];
    for (const s of level3) {
      groups.push({ monads: s.monads, words: words.filter((w) => contains(s.monads, w.monad)) });
    }
    return groups;
  }, [dictionary, words]);

  // Párrafos por versículo (bcv[2]) dentro de cada frase
  const verses = useMemo(() => {
    const out: { sentenceMonads: string; verse: number; showVerse: boolean; words: Word[] }[][] = [];
    let lastVerse = 0;
    for (const s of sentences) {
      const paragraphs: { sentenceMonads: string; verse: number; showVerse: boolean; words: Word[] }[] = [];
      let current = 0;
      for (const w of s.words) {
        const v = Number(w.bcv[2] ?? 0);
        if (v !== current) {
          current = v;
          paragraphs.push({ sentenceMonads: s.monads, verse: v, showVerse: v !== lastVerse, words: [] });
          lastVerse = v;
        }
        paragraphs[paragraphs.length - 1].words.push(w);
      }
      out.push(paragraphs);
    }
    return out;
  }, [sentences]);

  const glossTitle = (w: Word) => {
    const gloss = w.features?.["english"] ?? "";
    const parts: string[] = [];
    if (gloss && gloss !== "*") parts.push(gloss);
    return parts.join(" · ");
  };

  return (
    <div className="space-y-4" dir="auto">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{bookTitle}</h1>
        <div className="flex gap-3 text-sm">
          {shebanq_link && (
            <a href={shebanq_link} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
              SHEBANQ
            </a>
          )}
          <a href={`/text/${db}`} className="text-primary underline-offset-4 hover:underline">
            Select text
          </a>
        </div>
      </header>

      {verses.map((paragraphs, si) => (
        <section key={si} className="rounded border p-4">
          {paragraphs.map((p, vi) => (
            <p key={vi} className="text-lg leading-relaxed">
              {p.showVerse && <sup className="mr-1 text-sm text-muted-foreground">{p.verse}</sup>}
              {p.words.map((w, wi) => {
                const title = glossTitle(w);
                return (
                  <span key={wi} title={title || undefined} className="cursor-help">
                    <bdi>{w.text}</bdi>
                    {w.suffix}
                  </span>
                );
              })}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
