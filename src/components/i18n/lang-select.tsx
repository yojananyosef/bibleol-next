"use client";

import { useEffect, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

/** Selector de idioma/variante de interfaz (Ctrl_lang) como dropdown en el menú. */
export function LangSelect({
  current,
  variant,
  variants,
  options,
  label,
  variantLabel,
  mainVariantLabel,
}: {
  current: string;
  variant: string;
  variants: string[];
  options: Option[];
  label: string;
  variantLabel: string;
  mainVariantLabel: string;
}) {
  const [openLang, setOpenLang] = useState(false);
  const [openVar, setOpenVar] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const varRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setOpenLang(false);
      if (varRef.current && !varRef.current.contains(e.target as Node)) setOpenVar(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="relative" ref={langRef}>
        <button
          type="button"
          onClick={() => setOpenLang((o) => !o)}
          className="rounded border bg-background px-2 py-1 text-xs hover:bg-muted"
        >
          {label}
        </button>
        {openLang && (
          <div className="absolute right-0 z-20 mt-1 min-w-[9rem] rounded-md border bg-background py-1 shadow-md">
            {options.map((o) => (
              <a
                key={o.value}
                href={`/lang?lang=${encodeURIComponent(o.value)}`}
                onClick={() => setOpenLang(false)}
                className={`block px-3 py-1 text-xs hover:bg-muted ${o.value === current ? "font-semibold" : ""}`}
              >
                {o.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {variants.length > 0 && (
        <div className="relative" ref={varRef}>
          <button
            type="button"
            onClick={() => setOpenVar((o) => !o)}
            className="rounded border bg-background px-2 py-1 text-xs hover:bg-muted"
          >
            {variantLabel}
          </button>
          {openVar && (
            <div className="absolute right-0 z-20 mt-1 min-w-[9rem] rounded-md border bg-background py-1 shadow-md">
              <a
                href="/lang/variant?variant=main"
                onClick={() => setOpenVar(false)}
                className={`block px-3 py-1 text-xs hover:bg-muted ${variant === "" ? "font-semibold" : ""}`}
              >
                {mainVariantLabel}
              </a>
              {variants.map((v) => (
                <a
                  key={v}
                  href={`/lang/variant?variant=${encodeURIComponent(v)}`}
                  onClick={() => setOpenVar(false)}
                  className={`block px-3 py-1 text-xs hover:bg-muted ${variant === v ? "font-semibold" : ""}`}
                >
                  {v}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
