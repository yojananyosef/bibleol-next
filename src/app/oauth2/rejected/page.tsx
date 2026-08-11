import { sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** view_rejected_policy del legacy (texto OAuth2). */
export default async function OAuth2RejectedPage() {
  const lang = await sessionLanguage();
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-2xl border-destructive/40">
        <CardHeader className="bg-destructive/10">
          <CardTitle>{langLine(lang, "privacy", "you_rejected_header")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{langLine(lang, "privacy", "you_rejected_oauth2_text")}</p>
        </CardContent>
      </Card>
    </main>
  );
}