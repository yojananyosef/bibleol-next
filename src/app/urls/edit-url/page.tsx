import { checkAdmin } from "@/lib/auth/guards";
import { sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import {
  getHebButtons, getAramButtons, getFrequentGlosses, getGlosses, getHebUrls,
  srcLangShort2long,
} from "@/lib/services/urls";
import { GlossBlock } from "@/components/urls/gloss-selector";
import { EditUrlTable } from "@/components/urls/edit-url-table";

export const dynamic = "force-dynamic";

const GLOSS_COUNT = 300;

interface PageProps {
  searchParams: Promise<{ src_lang?: string; buttonix?: string }>;
}

/** /urls/edit-url — Ctrl_urls::edit_url: botones de glosa + tabla de URLs. */
export default async function EditUrlPage({ searchParams }: PageProps) {
  await checkAdmin();
  const { src_lang = "heb", buttonix } = await searchParams;

  const language = srcLangShort2long(src_lang);
  const buttons = src_lang === "aram" ? getAramButtons() : getHebButtons();
  const buttonIndex = buttonix === undefined ? 0 : Number(buttonix);

  const words = buttonIndex === -1
    ? getFrequentGlosses(language, GLOSS_COUNT)
    : getGlosses(language, buttons[buttonIndex][1], buttons[buttonIndex][2]);
  getHebUrls(language, words);

  const lang = await sessionLanguage();
  const head = langLine(lang, "urls", src_lang === "aram" ? "aramaic_glosses" : "hebrew_glosses");
  const byFrequency = langLine(lang, "translate", "by_frequency");
  const alphabetically = langLine(lang, "translate", "alphabetically");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_250px]">
        <div>
          <GlossBlock
            head={head}
            srcLang={src_lang}
            buttons={buttons}
            numGlosses={GLOSS_COUNT}
            glossCount={GLOSS_COUNT}
            buttonix={buttonix === undefined ? 0 : buttonIndex}
            styleClass="heb-default"
            byFrequency={byFrequency}
            alphabetically={alphabetically}
          />
          <EditUrlTable words={words} longlang={language} />
        </div>
        <aside>
          <h2 className="mb-2 text-lg font-semibold">{langLine(lang, "urls", "select_gloss_range_head")}</h2>
          <div
            className="text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: `${byFrequency}. ${alphabetically}.`,
            }}
          />
        </aside>
      </div>
    </main>
  );
}