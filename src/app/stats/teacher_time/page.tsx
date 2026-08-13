import Link from "next/link";
import { checkTeacher, sessionLanguage } from "@/lib/auth/guards";
import { DataException } from "@/lib/errors";
import * as stats from "@/lib/services/statistics";
import { getNamedUsersInClass } from "@/lib/services/userclass";
import { getClassById } from "@/lib/services/classes";
import { StatisticsPeriod, SECS_PER_WEEK } from "@/lib/statistics/period";
import { langText } from "@/lib/i18n/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodPicker } from "@/components/stats/period-picker";

export const dynamic = "force-dynamic";

function hmm(h: number): string {
  const f = Math.floor(h);
  return `${f}:${String(Math.round((h - f) * 60)).padStart(2, "0")}`;
}

/**
 * /stats/teacher_time?classid= — Ctrl_statistics::teacher_time (1:1):
 * horas por semana de cada alumno de la clase (solo clases propias).
 */
export default async function TeacherTimePage({
  searchParams,
}: {
  searchParams: Promise<{ classid?: string; start_date?: string; end_date?: string }>;
}) {
  const me = await checkTeacher();
  const lang = await sessionLanguage();
  const sp = await searchParams;
  const t = (key: string) => langText(lang, key);

  const classid = Number(sp.classid ?? 0);
  if (!Number.isInteger(classid) || classid <= 0) throw new DataException("illegal_class_id");
  const klass = getClassById(classid, me);
  if (klass.ownerid !== me.id) throw new DataException("illegal_class_id");

  const period = new StatisticsPeriod("long");
  let status: 1 | 2 = 2;
  const realStudents: Map<number, string> = new Map();
  const dur = new Map<number, Map<number, number>>();
  const total = new Map<number, number>();

  const dateOk = (s?: string) => s === undefined || s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (dateOk(sp.start_date) && dateOk(sp.end_date)) {
    status = 1;
    period.okDates(sp.start_date ?? null, sp.end_date ?? null);

    const students = getNamedUsersInClass(classid);
    if (students.length === 0) throw new DataException("No students in class");
    const studentIds = students.map((s) => s.userid);

    const templates = stats.getTemplatesForClassAndStudents(classid, studentIds);
    const durations = stats.getQuizzesDuration(templates, period.startTimestamp(), period.endTimestamp());

    const withData = new Set<number>();
    for (const d of durations) withData.add(d.userid);
    const orderedIds = [...withData].sort((a, b) => a - b);

    for (let w = period.startWeek(); w < period.endWeek(); w += SECS_PER_WEEK) {
      dur.set(w, new Map(orderedIds.map((id) => [id, 0])));
      total.set(w, 0);
    }
    for (const d of durations) {
      const hours = d.duration / 3600;
      const w = StatisticsPeriod.lastMonday(d.start);
      const row = dur.get(w);
      if (row) row.set(d.userid, (row.get(d.userid) ?? 0) + hours);
      total.set(w, (total.get(w) ?? 0) + hours);
    }
    const names = new Map(students.map((s) => [s.userid, s.name]));
    for (const id of orderedIds) realStudents.set(id, names.get(id) ?? `#${id}`);
  } else {
    period.defaultDates();
  }

  const sumTotal = [...total.values()].reduce((a, b) => a + b, 0);
  const weeks = [...total.keys()].sort((a, b) => a - b);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("stat_for_class").replace("%s", klass.classname)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {period.startString()} → {period.endString()}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <PeriodPicker startDate={period.startString()} endDate={period.endString()} />

          {status === 1 && sumTotal === 0 && <p className="text-muted-foreground">{t("no_data")}</p>}

          {status === 1 && sumTotal > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("iso_week_no")}</TableHead>
                  {weeks.map((w) => (
                    <TableHead key={w} className="text-center whitespace-nowrap">
                      {StatisticsPeriod.formatWeek(w)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...realStudents.entries()].map(([id, name]) => (
                  <TableRow key={id}>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/stats/time?userid=${id}&start_date=${period.startString()}&end_date=${period.endString()}&classid=${classid}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {name}
                      </Link>
                    </TableCell>
                    {weeks.map((w) => (
                      <TableCell key={w} className="text-center">
                        {hmm(dur.get(w)?.get(id) ?? 0)}
                      </TableCell>
                    ))}
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