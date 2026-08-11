import Link from "next/link";
import { checkTranslator } from "@/lib/auth/guards";
import * as translate from "@/lib/services/translate";
import { updateIfAction } from "@/app/actions/translate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransEditor } from "@/components/translate/trans-editor";
import { TransNavSelect } from "@/components/translate/trans-nav-select";

export const dynamic = "force-dynamic";

export const linesPerPage = 50;

function buildUrl(sp: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s === "" ? "/translate/if" : `/translate/if?${s}`;
}

/** /translate/if — Ctrl_translate::translate_if: traducir las cadenas de la interfaz. */
export default async function TranslateIfPage({
  searchParams,
}: {
  searchParams: Promise<{ lang_show?: string; lang_edit?: string; group?: string; offset?: string; orderby?: string; sortorder?: string }>;
}) {
  await checkTranslator();
  const sp = await searchParams;

  const groupList = translate.getTextgroupList().sort();
  const langList = translate.getIfLanguages();
  const sortedLangs = Object.entries(langList).sort((a, b) => a[1].localeCompare(b[1]));

  const langShow = sp.lang_show && langList[sp.lang_show] ? sp.lang_show : "en";
  const langEdit = sp.lang_edit && langList[sp.lang_edit] ? sp.lang_edit : "da";
  let group = sp.group ?? "";
  if (!groupList.includes(group)) group = groupList[0];

  const lineCount = translate.countIfLines(group);
  const pageCount = Math.max(1, Math.ceil(lineCount / linesPerPage));
  let offset = Number(sp.offset ?? 0);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  if (offset >= pageCount) offset = pageCount - 1;

  const orderby = ["symbolic_name", "text_show", "text_edit"].includes(sp.orderby ?? "") ? sp.orderby! : "symbolic_name";
  const sortorder = sp.sortorder === "desc" ? "desc" : "asc";

  const allLines = translate.getIfLinesPart(langEdit, langShow, group, linesPerPage, offset * linesPerPage, orderby, sortorder);

  const rows = allLines.map((l) => ({
    key: l.symbolic_name,
    symbolic: l.symbolic_name,
    comment: l.comment ?? "",
    textShow: l.text_show ?? "",
    textEdit: l.text_edit ?? "",
    textarea: l.use_textarea === 1,
  }));

  const spStr = (o: Record<string, string | number | undefined>) => ({
    ...sp,
    ...o,
    group,
    lang_show: langShow,
    lang_edit: langEdit,
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Translate user interface</CardTitle>
            <p className="text-sm text-muted-foreground">Edit the interface strings of the selected text group.</p>
          </div>
          <Link href="/translate/list" className="text-sm text-primary underline-offset-4 hover:underline">
            Translation overview
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <TransNavSelect
              label="Text group"
              value={group}
              urlTemplate={buildUrl(spStr({ offset: 0, group: "{0}" }))}
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
            <p className="text-xs text-muted-foreground">
              {lineCount} items in group &middot; {linesPerPage} per page
            </p>
          </div>

          {pageCount > 1 && (
            <nav className="flex flex-wrap gap-1 text-sm">
              {Array.from({ length: pageCount }, (_, i) => i).map((p) => (
                <Link
                  key={p}
                  href={buildUrl(spStr({ offset: p }))}
                  className={p === offset ? "rounded bg-primary px-2 py-1 text-primary-foreground" : "rounded px-2 py-1 hover:bg-muted"}
                >
                  {p + 1}
                </Link>
              ))}
            </nav>
          )}

          <TransEditor
            rows={rows}
            submitLabel="Submit changes"
            action={updateIfAction}
          >
            <input type="hidden" name="lang_edit" value={langEdit} />
            <input type="hidden" name="group" value={group} />
          </TransEditor>
        </CardContent>
      </Card>
    </main>
  );
}
