import { checkTranslator } from "@/lib/auth/guards";
import * as translate from "@/lib/services/translate";
import { hebButtonsLong, aramButtonsLong, greekButtonsLong, latinButtonsLong } from "@/lib/services/urls-buttons-long";
import { GlossSelectorAll } from "@/components/urls/gloss-selector";

export const dynamic = "force-dynamic";

export const glossCount = 100;

export function lexiconEditorHref(srcLang: string, buttonix: number): string {
  return `/translate/edit-lex?src_lang=${srcLang}&buttonix=${buttonix}#targetlang`;
}

/** /translate/lexicon — Ctrl_translate::translate_lex: seleccionar palabras a traducir. */
export default async function TranslateLexiconPage() {
  await checkTranslator();

  const hebGlosses = translate.getNumberGlosses("heb");
  const aramGlosses = translate.getNumberGlosses("aram");
  const greekGlosses = translate.getNumberGlosses("greek");
  const latinGlosses = translate.getNumberGlosses("latin");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="mb-1 text-xl font-semibold">Translate lexicon</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Select the words to translate. There are {hebGlosses + aramGlosses + greekGlosses + latinGlosses} glosses in all.
      </p>
      <GlossSelectorAll
        hebButtons={hebButtonsLong}
        aramButtons={aramButtonsLong}
        greekButtons={greekButtonsLong}
        latinButtons={latinButtonsLong}
        hebGlosses={hebGlosses}
        aramGlosses={aramGlosses}
        greekGlosses={greekGlosses}
        latinGlosses={latinGlosses}
        numGlosses={hebGlosses}
        glossCount={glossCount}
        withGreek
        byFrequency="By frequency"
        alphabetically="Alphabetically"
        editorHref={lexiconEditorHref}
      />
    </main>
  );
}
