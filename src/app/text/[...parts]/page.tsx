import { notFound } from "next/navigation";
import { showText, TextError } from "@/lib/services/corpus";
import { sessionLanguage } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { fontSelection } from "@/lib/services/config";
import { buildFontCss } from "@/lib/reader/font-css";
import { TextDisplay } from "@/components/text/text-display";

export const dynamic = "force-dynamic";

export default async function PassagePage({
  params,
  searchParams,
}: {
  params: Promise<{ parts: string[] }>;
  searchParams: Promise<{ icons?: string }>;
}) {
  const { parts } = await params;
  const { icons } = await searchParams;

  const [db = "ETCBC4", book = "Genesis", chapterStr = "1", vfromStr, vtoStr] = parts;
  const chapter = Number(chapterStr);
  const vfrom = vfromStr ? Number(vfromStr) : 0;
  const vto = vtoStr ? Number(vtoStr) : vfrom;

  if (!Number.isInteger(chapter) || chapter <= 0) notFound();
  if (vfromStr && (!Number.isInteger(vfrom) || vfrom <= 0)) notFound();
  if (vtoStr && (!Number.isInteger(vto) || vto <= 0)) notFound();

  let language = await sessionLanguage();
  const session = await getSession();
  const fonts = fontSelection(session?.userId ?? 0);
  const fontCss = buildFontCss(fonts);
  let result;
  try {
    result = showText(db, book, chapter, vfrom, vto, language, icons === "on");
  } catch (e) {
    if (e instanceof TextError && e.message === "no_text_found") {
      return (
        <main className="flex flex-1 items-center justify-center p-6">
          <p className="text-muted-foreground">No text found</p>
        </main>
      );
    }
    if (language !== "en") {
      // Localización ausente para el idioma de la sesión → probamos con inglés
      language = "en";
      try {
        result = showText(db, book, chapter, vfrom, vto, language, icons === "on");
      } catch {
        notFound();
      }
    } else {
      notFound();
    }
  }

  return (
    <main className="flex flex-1 justify-center p-6">
      <style dangerouslySetInnerHTML={{ __html: fontCss }} />
      <div className="w-full max-w-3xl">
        <TextDisplay
          db={db}
          bookTitle={result.bookTitle}
          dictionary={result.dictionary}
          shebanq_link={result.shebanq_link}
          dbinfo={result.reader}
          l10n={result.reader.l10n}
          typeinfo={result.reader.typeinfo}
        />
      </div>
    </main>
  );
}
