import Link from "next/link";
import { checkTeacher, sessionLanguage } from "@/lib/auth/guards";
import { getNamedClassesOwned, type ClassRow } from "@/lib/services/classes";
import { langText } from "@/lib/i18n/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/**
 * /stats/teacher_progress — Ctrl_statistics::teacher_progress (1:1):
 * lista de clases del profesor con enlace al progreso semanal de alumnos.
 */
export default async function TeacherProgressPage() {
  const me = await checkTeacher();
  const lang = await sessionLanguage();
  const classes = getNamedClassesOwned(me, false);
  const t = (key: string) => langText(lang, key);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("teacher_graphs_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <h2 className="text-muted-foreground">{t("no_classes")}</h2>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("class")}</TableHead>
                  <TableHead>{t("select_grouped_by")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((cl: ClassRow) => (
                  <TableRow key={cl.id}>
                    <TableCell>{cl.classname}</TableCell>
                    <TableCell>
                      <Link
                        href={`/stats/teacher_time?classid=${cl.id}`}
                        className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
                      >
                        {t("grouped_by_students")}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}