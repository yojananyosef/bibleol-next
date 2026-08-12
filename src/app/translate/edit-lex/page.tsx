import { checkTranslator, sessionLanguage } from "@/lib/auth/guards";
import * as translate from "@/lib/services/translate";
import { hebButtonsLong, aramButtonsLong, greekButtonsLong, latinButtonsLong } from "@/lib/services/urls-buttons-long";
import { stripSortIndex } from "@/lib/statistics/feature-l10n";
import { GlossBlock } from "@/components/urls/gloss-selector";
import { LexEditor } from "@/components/translate/lex-editor";
import { TransNavSelect } from "@/components/translate/trans-nav-select";
import { updateLexAction } from "@/app/actions/translate";
import { getSession } from "@/lib/auth/session";
import { glossCount, lexiconEditorHref } from "../lexicon/page";

export const dynamic = "force-dynamic";

const SRC_LANGS = ["heb", "aram", "greek", "latin"] as const;

function buildUrl(sp: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s === "" ? "/translate/edit-lex" : `/translate/edit-lex?${s}#targetlang`;
}

/** /translate/edit-lex — Ctrl_translate::edit_lex: editar las glosas del léxico. */
export default async function TranslateEditLexPage({
  searchParams,
}: {
  searchParams: Promise<{ src_lang?: string; buttonix?: string; lang_show?: string; lang_edit?: string }>;
}) {
  await checkTranslator();
  const sp = await searchParams;

  const srcLang = SRC_LANGS.includes(sp.src_lang as never) ? (sp.src_lang as (typeof SRC_LANGS)[number]) : "heb";
  let buttonIndex = Number(sp.buttonix ?? 0);
  if (!Number.isInteger(buttonIndex)) buttonIndex = 0;

  const lexiconLangList = translate.getAllLexiconLangs();
  const dstLangs = lexiconLangList[srcLang];
  const langShow = sp.lang_show && dstLangs[sp.lang_show] ? sp.lang_show : "en";
  const langEdit = sp.lang_edit && dstLangs[sp.lang_edit] ? sp.lang_edit : "en";
  if (!dstLangs[langEdit]) throw new Error("Uknown destination language");

  const session = await getSession();
  const variant = session?.variant || null;
  const language = await sessionLanguage();

  let buttons: [string, string, string][] = [];
  let stems: { [vs: string]: string } = {};
  let books: { [book: string]: string } = {};
  switch (srcLang) {
    case "heb":
    case "aram":
      buttons = srcLang === "heb" ? hebButtonsLong : aramButtonsLong;
      [stems, books] = translate.getLocalizedETCBC4(language);
      break;
    case "greek":
      buttons = greekButtonsLong;
      [, books] = translate.getLocalizedNoStems("nestle1904", language);
      break;
    case "latin":
      buttons = latinButtonsLong;
      [, books] = translate.getLocalizedNoStems("jvulgate", language);
      break;
  }
  const longTarget = dstLangs[langEdit];
  const sortedDst = Object.entries(dstLangs).sort((a, b) => a[1].localeCompare(b[1]));

  const numGlosses = translate.getNumberGlosses(srcLang);
  const words =
    buttonIndex < 0
      ? translate.getFrequentGlossesForEdit(srcLang, langEdit, langShow, (-1 - buttonIndex) * glossCount, glossCount, variant)
      : translate.getGlossesForEdit(srcLang, langEdit, langShow, buttons[buttonIndex]?.[1] ?? "", buttons[buttonIndex]?.[2] ?? "", variant);

  const label = books["_label"] ?? "%s %d:%d";
  const rows = words.map((w, ix) => {
    const db = srcLang === "heb" || srcLang === "aram" ? "ETCBC4" : srcLang === "greek" ? "nestle1904" : "jvulgate";
    const repeat = (srcLang === "heb" || srcLang === "aram") && ix > 0 && words[ix - 1].lex === w.lex;
    return {
      key: String(w.lex_id),
      tally: String(w.tally),
      lex: w.lex,
      lexeme: w.lexeme,
      stem: stems[w.vs] !== undefined ? stripSortIndex(stems[w.vs]) : "",
      strongs: w.strongs !== null ? String(w.strongs) + (w.strongs_unreliable ? "?" : "") : "",
      partOfSpeech: w.part_of_speech,
      first: {
        href: `/text/${db}/${w.firstbook}/${w.firstchapter}/${w.firstverse}`,
        label: label.replace("%s", books[w.firstbook] ?? "").replace("%d", String(w.firstchapter)).replace("%d", String(w.firstverse)),
      },
      textShow: w.text_show ?? "",
      textEdit: w.text_edit ?? "",
      repeat,
    };
  });

  const spStr = (o: Record<string, string | number | undefined>) => ({
    ...sp,
    ...o,
    src_lang: srcLang,
    buttonix: buttonIndex,
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="mb-1 text-xl font-semibold">Translate lexicon</h1>
      <p className="mb-6 text-sm text-muted-foreground">Edit the glosses of the selected words.</p>

      <GlossBlock
        head={srcLang === "heb" ? "Hebrew glosses" : srcLang === "aram" ? "Aramaic glosses" : srcLang === "greek" ? "Greek glosses" : "Latin glosses"}
        srcLang={srcLang}
        buttons={buttons}
        numGlosses={numGlosses}
        glossCount={glossCount}
        buttonix={buttonIndex}
        styleClass={srcLang === "heb" || srcLang === "aram" ? "heb-default" : srcLang === "greek" ? "greek-default" : "latin-default"}
        byFrequency="By frequency"
        alphabetically="Alphabetically"
        editorHref={lexiconEditorHref}
      />

      <p id="targetlang">
        <strong>Target language</strong>
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-4 text-sm">
        <TransNavSelect
          label="Target language"
          value={langEdit}
          urlTemplate={buildUrl(spStr({ lang_edit: "{0}" }))}
          options={sortedDst.map(([abb, name]) => ({ value: abb, label: name }))}
        />
        <TransNavSelect
          label="Show…"
          value={langShow}
          urlTemplate={buildUrl(spStr({ lang_show: "{0}" }))}
          options={sortedDst.map(([abb, name]) => ({ value: abb, label: name }))}
        />
        {variant && <p className="text-xs text-muted-foreground">for variant {variant}</p>}
      </div>

      <LexEditor srcLang={srcLang} rows={rows} submitLabel="Submit changes" action={updateLexAction}>
        <input type="hidden" name="src_lang" value={srcLang} />
        <input type="hidden" name="lang_edit" value={langEdit} />
      </LexEditor>
      <p className="mt-2 text-xs text-muted-foreground">
        Target language: {longTarget}
        {variant ? <> for variant {variant}</> : null}
      </p>
    </main>
  );
}