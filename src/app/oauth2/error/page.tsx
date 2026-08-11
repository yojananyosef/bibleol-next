import { sessionLanguage } from "@/lib/auth/guards";
import { langLine, langText } from "@/lib/i18n/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ key?: string }>;
}

/** view_error del legacy: mensaje de error del flujo OAuth2. */
export default async function OAuth2ErrorPage({ searchParams }: PageProps) {
  const { key } = await searchParams;
  const lang = await sessionLanguage();
  // La clave puede ser una clave i18n (access_denied_from_google…) o un texto crudo.
  // langLine devuelve la clave literal cuando no existe traducción.
  const raw = key ?? "unknown_error";
  const inLogin = langLine(lang, "login", raw) !== raw;
  const inCommon = langLine(lang, "common", raw) !== raw;
  const msg = inLogin ? langLine(lang, "login", raw) : inCommon ? langLine(lang, "common", raw) : raw;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle>{langText(lang, "error")}</CardTitle>
        </CardHeader>
        <CardContent className="text-destructive">{msg}</CardContent>
      </Card>
    </main>
  );
}