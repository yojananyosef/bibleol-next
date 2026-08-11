import Link from "next/link";
import { checkTranslator } from "@/lib/auth/guards";
import * as translate from "@/lib/services/translate";
import { getAppDb } from "@/lib/db/sqlite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { modifyLocalizationAction } from "@/app/actions/translate";
import { AddLanguageForm } from "./add-language-form";

export const dynamic = "force-dynamic";

/**
 * /translate/list — Ctrl_translate::list_translations: progreso de traducción
 * por idioma (interfaz + gramática de cada corpus) + enable/disable + add.
 */
export default async function TranslateListPage() {
  await checkTranslator();
  const langs = translate.getIfLanguages();
  const dbList = translate.getDbList();
  const totalIf = translate.countIfLines(null);

  const progressIf: Record<string, [number, number]> = {};
  const progressGrammar: Record<string, Record<string, [number, number]>> = {};
  for (const abb of Object.keys(langs)) {
    progressIf[abb] = [translate.countIfTranslated(abb), totalIf];
    progressGrammar[abb] = {};
    for (const db of dbList) {
      progressGrammar[abb][db] = [translate.countGrammarTranslated(db, abb), translate.countGrammarLines(db)];
    }
  }

  // Solo los idiomas con archivos langsrc son editables en interfaz
  const allLangs = getAppDb()
    .prepare("SELECT id, abb, internal, native, iface_enabled, heblex_enabled, greeklex_enabled, latinlex_enabled, latin2lex_enabled FROM bol_translation_languages ORDER BY internal")
    .all() as {
    id: number;
    abb: string;
    internal: string;
    native: string;
    iface_enabled: number;
    heblex_enabled: number;
    greeklex_enabled: number;
    latinlex_enabled: number;
    latin2lex_enabled: number;
  }[];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Available localizations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enable or disable localizations, or add a new translation language.
            </p>
          </div>
          <Link href="/translate/if" className="text-sm text-primary underline-offset-4 hover:underline">
            Translate interface
          </Link>
        </CardHeader>
        <CardContent className="space-y-6">
          <table className="w-full border text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left">Language</th>
                <th className="p-2 text-left">Interface</th>
                {dbList.map((db) => (
                  <th key={db} className="p-2 text-left">
                    {db}
                  </th>
                ))}
                <th className="p-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {allLangs.map((l) => (
                <tr key={l.id} className="border-b">
                  <td className="p-2">
                    {l.native} <span className="text-muted-foreground">({l.abb})</span>
                  </td>
                  <td className="p-2">
                    {l.iface_enabled ? (
                      <span>{(progressIf[l.abb]?.[0] ?? 0)}/{totalIf}</span>
                    ) : (
                      <span className="text-muted-foreground">disabled</span>
                    )}
                  </td>
                  {dbList.map((db) => (
                    <td key={db} className="p-2">
                      {l.iface_enabled ? (
                        <span>
                          {progressGrammar[l.abb]?.[db]?.[0] ?? 0}/{progressGrammar[l.abb]?.[db]?.[1] ?? 0}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ))}
                  <td className="p-2">
                    <form action={modifyLocalizationAction} className="flex gap-1">
                      <input type="hidden" name="lang" value={l.abb} />
                      <input type="hidden" name="loc_type" value="iface" />
                      <Button
                        type="submit"
                        name="enable"
                        value={l.iface_enabled ? "false" : "true"}
                        variant="outline"
                        size="sm"
                        formAction={modifyLocalizationAction}
                        className="h-6 px-2 text-xs"
                      >
                        {l.iface_enabled ? "Disable" : "Enable"}
                      </Button>
                    </form>
                  </td>
                  {void (() => {})()}
                </tr>
              ))}
            </tbody>
          </table>
          <AddLanguageForm />
        </CardContent>
      </Card>
    </main>
  );
}
