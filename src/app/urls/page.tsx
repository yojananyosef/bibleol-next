import { checkAdmin } from "@/lib/auth/guards";
import { sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { getHebButtons, getAramButtons } from "@/lib/services/urls";
import { GlossSelectorAll } from "@/components/urls/gloss-selector";

export const dynamic = "force-dynamic";

const GLOSS_COUNT = 300;

/** /urls — Ctrl_urls::select_lang: elegir idioma y rango de glosas. */
export default async function UrlsPage() {
  await checkAdmin();
  const lang = await sessionLanguage();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_250px]">
        <div>
          <GlossSelectorAll
            hebButtons={getHebButtons()}
            aramButtons={getAramButtons()}
            numGlosses={GLOSS_COUNT}
            glossCount={GLOSS_COUNT}
            byFrequency={langLine(lang, "translate", "by_frequency")}
            alphabetically={langLine(lang, "translate", "alphabetically")}
            greekHead={langLine(lang, "urls", "greek_glosses")}
            latinHead={langLine(lang, "urls", "latin_glosses")}
            noGreek={langLine(lang, "urls", "no_greek")}
            noLatin={langLine(lang, "urls", "no_latin")}
          />
        </div>
        <aside>
          <h2 className="mb-2 text-lg font-semibold">{langLine(lang, "urls", "select_gloss_range_head")}</h2>
          <div
            className="text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: langLine(lang, "urls", "select_gloss_range").replace("%d", String(GLOSS_COUNT)),
            }}
          />
        </aside>
      </div>
    </main>
  );
}