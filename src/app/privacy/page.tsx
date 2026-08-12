import { sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parsePolicyText } from "../policy-text";

export const dynamic = "force-dynamic";

/** view_privacy del legacy (Ctrl_privacy): título + texto de la política. */
export default async function PrivacyPage() {
  const lang = await sessionLanguage();
  const title = langLine(lang, "privacy", "privacy_policy_title");
  const { text } = parsePolicyText(langLine(lang, "privacy", "privacy_text"));
  return (
    <main className="flex flex-1 items-start justify-center p-6">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div dangerouslySetInnerHTML={{ __html: text }} />
        </CardContent>
      </Card>
    </main>
  );
}