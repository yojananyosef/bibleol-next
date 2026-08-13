import { getDbAndBooks } from "@/lib/services/corpus";
import { sessionLanguage } from "@/lib/auth/guards";
import { SelectTextForm } from "@/components/text/select-text-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function TextPage() {
  const language = await sessionLanguage();
  const databases = getDbAndBooks(language);

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-xl font-semibold">Select text</h1>
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <SelectTextForm databases={databases} />
          <Card className="h-fit">
            <CardContent className="pt-6">
              <h2 className="mb-2 text-sm font-semibold">Corpus copyrights</h2>
              <ul className="space-y-3 text-xs text-muted-foreground">
                {databases.map((db) => (
                  <li key={db.name}>
                    <strong className="font-medium text-foreground">{db.name}</strong>
                    {db.loc_copyright ? <div dangerouslySetInnerHTML={{ __html: db.loc_copyright }} /> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
