"use client";

import { useMemo, useState } from "react";

/**
 * VirtualKeyboard.tsx — Teclado virtual global de la vista de quiz (port del
 * widget legacy VirtualKeyboard.full.3.7.2, layouts "IL Biblical Hebrew (SIL)"
 * y "GR Greek Polytonic"). El legacy lo cargaba vía vk_loader.js cuando
 * quizFeatures.useVirtualKeyboard; aquí es un componente React flotante que
 * inserta caracteres en el input que tenga el foco (data-kbid → activeElement).
 *
 * El input de la vista es controlado por React: se usa el setter nativo de
 * HTMLInputElement.value + el evento `input` para que onChange se dispare.
 */

export type VkCharset = "hebrew" | "greek";

/** IL Biblical Hebrew (SIL): 27 letras + formas finales + signos de puntuación. */
const HEBREW: string[][] = [
  ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י"],
  ["כ", "ך", "ל", "מ", "ם", "נ", "ן", "ס", "ע", "פ"],
  ["ף", "צ", "ץ", "ק", "ר", "ש", "ת", "־", "ּ"],
];

/** GR Greek Polytonic: alfabeto (minúsculas y mayúsculas) + politónicos. */
const GREEK_LOWER: string[][] = [
  ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ"],
  ["ν", "ξ", "ο", "π", "ρ", "σ", "ς", "τ", "υ", "φ", "χ", "ψ", "ω"],
  ["ά", "έ", "ή", "ί", "ό", "ύ", "ώ", "ϊ", "ϋ", "ΐ", "ΰ"],
  ["ἀ", "ἁ", "ἄ", "ἅ", "ἐ", "ἑ", "ἔ", "ἕ", "ἰ", "ἱ", "ἴ", "ἵ"],
  ["ὀ", "ὁ", "ὄ", "ὅ", "ὐ", "ὑ", "ὔ", "ὕ", "ᾶ", "ῆ", "ῖ", "ῦ", "ῶ"],
  ["ᾳ", "ῃ", "ῳ", "ᾴ", "ῄ", "ῴ", "ᾷ", "ῇ", "ῷ", "᾽"],
];

const GREEK_UPPER: string[][] = [
  ["Α", "Β", "Γ", "Δ", "Ε", "Ζ", "Η", "Θ", "Ι", "Κ", "Λ", "Μ"],
  ["Ν", "Ξ", "Ο", "Π", "Ρ", "Σ", "Τ", "Υ", "Φ", "Χ", "Ψ", "Ω"],
  ["Ά", "Έ", "Ή", "Ί", "Ό", "Ύ", "Ώ", "Ϊ", "Ϋ"],
  ["Ἀ", "Ἁ", "Ἄ", "Ἅ", "Ἐ", "Ἑ", "Ἔ", "Ἕ", "Ἰ", "Ἱ", "Ἴ", "Ἵ"],
  ["Ὀ", "Ὁ", "Ὄ", "Ὅ", "Ὑ", "Ὕ", "Ὗ"],
];

/**
 * Inserta `char` en el elemento con foco (input de la vista de quiz). Usa el
 * setter nativo para que React (valor controlado) lo registre vía `input`.
 */
export function insertCharIntoActiveElement(char: string): void {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement) || el.type === "number") return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  setter.call(el, el.value.slice(0, start) + char + el.value.slice(end));
  el.setSelectionRange(start + char.length, start + char.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

export function VirtualKeyboard({ charset }: { charset: VkCharset }) {
  const [caps, setCaps] = useState(false);
  const rows = useMemo(() => {
    if (charset === "hebrew") return HEBREW;
    return caps ? GREEK_UPPER : GREEK_LOWER;
  }, [charset, caps]);

  const showCaps = charset === "greek";

  return (
    <div
      id="virtualKeyboard"
      className={`${charset === "hebrew" ? "HE" : "EL"} mt-2 w-fit rounded-md border bg-background p-2 shadow-md`}
      role="group"
      aria-label="Virtual keyboard"
    >
      {showCaps && (
        <button
          type="button"
          className={`mb-1 rounded border px-2 py-0.5 text-xs ${caps ? "bg-accent" : "bg-muted"}`}
          onClick={() => setCaps((c) => !c)}
        >
          Caps ⇧
        </button>
      )}
      <div className="flex flex-col gap-1">
        {rows.map((rowKeys, i) => (
          <div key={i} className="flex flex-wrap justify-center gap-1">
            {rowKeys.map((ch) => (
              <button
                key={ch}
                type="button"
                className="h-8 min-w-8 rounded border bg-background px-1 text-sm hover:bg-accent/50"
                onClick={() => insertCharIntoActiveElement(ch)}
              >
                {ch}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}