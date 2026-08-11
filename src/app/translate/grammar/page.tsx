import Link from "next/link";
import { checkTranslator } from "@/lib/auth/guards";
import * as translate from "@/lib/services/translate";
import { updateGrammarAction } from "@/app/actions/translate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransEditor } from "@/components/translate/trans-editor";
import { TransNavSelect } from "@/components/translate/trans-nav-select";

export const dynamic = "force-dynamic";

function buildUrl(sp: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v !== undefined && v !== null && v !== "") q.set(k, v);
  const s = q.toString();
  return s === "" ? "/translate/grammar" : `/translate/grammar?${s}`;
}

/** /translate/grammar — Ctrl_translate::translate_grammar. */
export default async function TranslateGrammarPage({
  searchParams,
}: {
  searchParams: Promise<{ lang_show?: string; lang_edit?: string; db?: string; group?: string }>;
}) {
  await checkTranslator();
  const sp = await searchParams;

  const dbList = translate.getDbList();
  const langList = translate.getIfLanguages();
  const sortedLangs = Object.entries(langList).sort((a, b) => a[1].localeCompare(b[1]));

  const db = sp.db && dbList.includes(sp.db) ? sp.db : "ETCBC4";
  const groupList = translate.getGrammargroupList(db);
  const langShow = sp.lang_show && langList[sp.lang_show] ? sp.lang_show : "en";
  const langEdit = sp.lang_edit && langList[sp.lang_edit] ? sp.lang_edit : "da";
  let group = sp.group ?? "";
  if (!groupList.includes(group)) group = groupList[0];

  const allLines = translate.getGrammarLinesPart(langEdit, langShow, db, group).map((l) => ({
    key: l.symbolic_name_dash,
    symbolic: group === "info" ? l.symbolic_name : l.symbolic_name.replace(`${group}.`, ""),
    comment: String(l.comment ?? "").replace(/^f:[a-z]+ /, ""),
    textShow: l.text_show,
    textEdit: l.text_edit,
    textarea: String(l.comment ?? "").startsWith("f:textarea"),
  }));

  const spStr = (o: Record<string, string | undefined>) => ({
    ...sp,
    ...o,
    db,
    group,
    lang_show: langShow,
    lang_edit: langEdit,
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Translate grammar terms</CardTitle>
            <p className="text-sm text-muted-foreground">Edit the grammar-localized terms of the selected corpus.</p>
          </div>
          <Link href="/translate/list" className="text-sm text-primary underline-offset-4 hover:underline">
            Translation overview
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <TransNavSelect
              label="Text database"
              value={db}
              urlTemplate={`/translate/grammar?db={0}&lang_show=${encodeURIComponent(langShow)}&lang_edit=${encodeURIComponent(langEdit)}`}
              options={dbList.map((d) => ({ value: d, label: d }))}
            />
            <TransNavSelect
              label="Name prefix"
              value={group}
              urlTemplate={buildUrl(spStr({ group: "{0}" }))}
              options={groupList.map((g) => ({ value: g, label: g }))}
            />
            <TransNavSelect
              label="Edit in…"
              value={langEdit}
              urlTemplate={buildUrl(spStr({ lang_edit: "{0}" }))}
              options={sortedLangs.map(([abb, name]) => ({ value: abb, label: name }))}
            />
            <TransNavSelect
              label="Show…"
              value={langShow}
              urlTemplate={buildUrl(spStr({ lang_show: "{0}" }))}
              options={sortedLangs.map(([abb, name]) => ({ value: abb, label: name }))}
            />
          </div>

          <TransEditor rows={allLines} submitLabel="Submit changes" action={updateGrammarAction}>
            <input type="hidden" name="lang_edit" value={langEdit} />
            <input type="hidden" name="db" value={db} />
          </TransEditor>
        </CardContent>
      </Card>
    </main>
  );
}
