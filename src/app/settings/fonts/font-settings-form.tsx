"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveFontSettingsAction, type ActionResult } from "@/app/actions/config";
import type { FontSetting } from "@/lib/services/config";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const STYLES = ["text", "feature", "input", "tooltip"] as const;

interface Props {
  alphabets: { name: string; direction: string; sample: string; english: string }[];
  fontSetting: Record<string, FontSetting>;
  availFonts: Record<string, [string, boolean][]>;
  personalFonts: Record<string, string>;
  choiceValues: Record<string, string>;
}

interface Preview {
  size: number;
  bold: boolean;
  italic: boolean;
}

function familyFor(avail: [string, boolean][] | undefined, choice: string, myFont: string): string {
  const ix = choice.split("_").pop() ?? "";
  if (ix === "mine") return myFont;
  const entry = avail?.[Number(ix)];
  return entry ? entry[0] : "";
}

export function FontSettingsForm({ alphabets, fontSetting, availFonts, personalFonts, choiceValues }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(saveFontSettingsAction, null);
  // elección por alfabeto (radio) y fuente personal; previsualización por estilo
  const [choices, setChoices] = useState<Record<string, string>>(choiceValues);
  const [myFonts, setMyFonts] = useState<Record<string, string>>(personalFonts);
  const [preview, setPreview] = useState<Record<string, Preview>>(() => {
    const out: Record<string, Preview> = {};
    for (const a of alphabets) {
      const fs = fontSetting[a.name];
      for (const s of STYLES) out[`${a.name}_${s}`] = { size: fs[`${s}_size`], bold: !!fs[`${s}_bold`], italic: !!fs[`${s}_italic`] };
    }
    return out;
  });

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      )}
      <Tabs defaultValue={alphabets[0]?.name}>
        <TabsList>
          {alphabets.map((a) => (
            <TabsTrigger key={a.name} value={a.name}>
              {a.english}
            </TabsTrigger>
          ))}
        </TabsList>
        {alphabets.map((a) => {
          const key = `${a.name}_`;
          const fam = familyFor(availFonts[a.name], choices[a.name], myFonts[a.name] ?? "");
          return (
            <TabsContent key={a.name} value={a.name} className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-base font-semibold">Select font family</h2>
                <div className="space-y-2 rounded border p-4">
                  {availFonts[a.name].map(([name, webfont], ix) => (
                    <label key={name} className="flex cursor-pointer items-center gap-3">
                      <input
                        type="radio"
                        name={`${a.name}choice`}
                        value={`${a.name}_${ix}`}
                        checked={choices[a.name] === `${a.name}_${ix}`}
                        onChange={() => setChoices((c) => ({ ...c, [a.name]: `${a.name}_${ix}` }))}
                      />
                      <span className={`${a.name} flex-1`} style={fam === name ? { fontFamily: name } : undefined}>
                        {name}
                        {webfont && <span className="ml-2 text-xs text-muted-foreground">(webfont)</span>}
                      </span>
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name={`${a.name}choice`}
                      value={`${a.name}_mine`}
                      checked={choices[a.name] === `${a.name}_mine`}
                      onChange={() => setChoices((c) => ({ ...c, [a.name]: `${a.name}_mine` }))}
                    />
                    <Input
                      className="w-56"
                      name={`${a.name}_myfont`}
                      placeholder="My font"
                      value={myFonts[a.name] ?? ""}
                      onChange={(e) => setMyFonts((m) => ({ ...m, [a.name]: e.target.value }))}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-base font-semibold">Select attributes</h2>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium">Settings for</th>
                        <th className="px-3 py-2 text-center font-medium">Bold</th>
                        <th className="px-3 py-2 text-center font-medium">Italic</th>
                        <th className="px-3 py-2 text-center font-medium">Size</th>
                        <th className="px-3 py-2 text-center font-medium">Sample</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STYLES.map((s) => {
                        const fs = fontSetting[a.name];
                        const p = preview[`${key}${s}`];
                        return (
                          <tr key={s} className="border-b last:border-0">
                            <td className="px-3 py-2 font-medium capitalize">{s}</td>
                            <td className="px-3 py-2 text-center">
                              <Checkbox
                                name={`${key}${s}bold`}
                                checked={p.bold}
                                onCheckedChange={(v) => setPreview((p2) => ({ ...p2, [`${key}${s}`]: { ...p2[`${key}${s}`], bold: !!v } }))}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Checkbox
                                name={`${key}${s}italic`}
                                checked={p.italic}
                                onCheckedChange={(v) => setPreview((p2) => ({ ...p2, [`${key}${s}`]: { ...p2[`${key}${s}`], italic: !!v } }))}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Input
                                className="mx-auto w-16"
                                name={`${key}${s}size`}
                                inputMode="numeric"
                                defaultValue={fs[`${s}_size`]}
                                onChange={(e) => setPreview((p2) => ({ ...p2, [`${key}${s}`]: { ...p2[`${key}${s}`], size: Number(e.target.value) || 0 } }))}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={`${a.name}${s === "text" ? " textdisplay" : s === "feature" ? " wordgrammar" : s === "tooltip" ? " bol-tooltip" : ""}`}
                                dir={a.direction}
                                style={{ fontFamily: fam, fontSize: p.size ? `${p.size}pt` : undefined, fontWeight: p.bold ? "bold" : "normal", fontStyle: p.italic ? "italic" : "normal" }}
                              >
                                {a.sample}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          OK
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
