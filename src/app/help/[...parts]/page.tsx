import Link from "next/link";
import { sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  evaluateArticle,
  helpNavigatorHtml,
  readHelpArticle,
  resolveHelpArticle,
} from "@/lib/services/help";

export const dynamic = "force-dynamic";

/** Ctrl_help::show_help: artículo de la guía del usuario + navegador (view_main_page). */
export default async function HelpPage({ params }: { params: Promise<{ parts: string[] }> }) {
  const { parts } = await params;
  const lang = await sessionLanguage();
  const fullArticle = parts.join("/") || "intro";

  let html = "";
  let error: string | null = null;
  try {
    const req = resolveHelpArticle(lang, fullArticle);
    html = evaluateArticle(readHelpArticle(req), {
      subArticle: req.subArticle,
      dir: req.dir,
      siteUrl: "/",
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error !== null) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-2xl border-destructive/40">
          <CardHeader className="bg-destructive/10">
            <CardTitle>{langLine(lang, "text", "select_text")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              {error} — <Link href="/help" className="underline">{langLine(lang, "text", "select_text")}</Link>
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="mb-4 text-2xl font-semibold">{langLine(lang, "text", "show_help")}</h1>
      <div className="grid grid-cols-[16rem_1fr] gap-6 max-md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Help pages</CardTitle>
          </CardHeader>
          <CardContent>
            <div dangerouslySetInnerHTML={{ __html: helpNavigatorHtml(fullArticle) }} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="help-article" dangerouslySetInnerHTML={{ __html: html }} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}