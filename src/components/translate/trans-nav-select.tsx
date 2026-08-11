"use client";

import { useCallback, useEffect, useRef } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  value: string;
  options: Option[];
  urlTemplate: string;
}

/** Select de navegación que sustituye {0} por el valor elegido (como view_translate.js). */
export function TransNavSelect({ label, value, options, urlTemplate }: Props) {
  const sel = useRef<HTMLSelectElement>(null);
  const handler = useCallback(() => {
    const el = sel.current;
    if (!el) return;
    document.location = urlTemplate.replace(/\{0\}/g, encodeURIComponent(el.value));
  }, [urlTemplate]);
  useEffect(() => {
    const el = sel.current;
    if (!el) return;
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [handler]);
  return (
    <label className="flex flex-col">
      {label}
      <select ref={sel} value={value} className="mt-1 h-9 rounded-md border bg-background px-2">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
