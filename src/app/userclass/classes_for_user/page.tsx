import Link from "next/link";
import { checkTeacher, sessionLanguage } from "@/lib/auth/guards";
import { getClassesForUserAction } from "@/app/actions/userclass";
import { langLine } from "@/lib/i18n/loader";
import { makeFullName, type UserRow } from "@/lib/services/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClassesForUserForm, type ClassForUserRow } from "@/components/userclass/classes-for-user-form";

export const dynamic = "force-dynamic";

/**
 * /userclass/classes_for_user?userid= — Ctrl_userclass::classes_for_user (1:1):
 * checkboxes de las clases owned para asignar al usuario.
 */
export default async function ClassesForUserPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await checkTeacher();
  const lang = await sessionLanguage();
  const sp = await searchParams;
  const userid = parseInt(String(sp.userid ?? "0"), 10) || 0;
  const offset = parseInt(String(sp.offset ?? "0"), 10) || 0;
  const orderby = String(sp.orderby ?? "username");
  const sortorder = sp.desc !== undefined ? "desc" : "asc";
  const extras = `offset=${offset}&orderby=${orderby}&${sortorder}`;

  const res = await getClassesForUserAction(userid);
  if (!res.ok || !res.data) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 p-6">
        <Card>
          <CardContent className="pt-6 text-destructive">{res.error}</CardContent>
        </Card>
      </main>
    );
  }
  const d = res.data as {
    userInfo: UserRow | null;
    allClasses: Array<{ clid: number; classname: string }>;
    ownedClasses: number[];
    oldClasses: number[];
  };
  const user_name = makeFullName(d.userInfo ?? { first_name: "", last_name: "", family_name_first: 0 });

  const rows: ClassForUserRow[] = d.allClasses
    .filter((c) => d.ownedClasses.includes(c.clid))
    .map((c) => ({ clid: c.clid, classname: c.classname, checked: d.oldClasses.includes(c.clid) }));

  const t = (group: string, key: string) => langLine(lang, group, key);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("userclass", "classes_for_user").replace("%s", user_name)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {t("userclass", "select_classes_for_user").replace("%s", user_name)}
          </p>
          <ClassesForUserForm
            userid={userid}
            rows={rows}
            extras={extras}
            l10n={{
              class: t("userclass", "class"),
              inThisClass: t("userclass", "in_this_class"),
              ok: t("common", "OK_button"),
              cancel: t("common", "cancel_button"),
            }}
          />
          <div className="mt-3">
            <Link href={`/admin/users?${extras}`} className="text-sm text-primary underline-offset-4 hover:underline">
              {t("userclass", "uc_edit_user")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}