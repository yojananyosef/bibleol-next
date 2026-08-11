import { checkLoggedIn } from "@/lib/auth/guards";
import { DataException } from "@/lib/errors";
import * as stats from "@/lib/services/statistics";
import * as users from "@/lib/services/users";
import { getClassesByIds } from "@/lib/services/classes";
import { getClassesForUser } from "@/lib/services/userclass";
import { StatisticsPeriod, SECS_PER_WEEK } from "@/lib/statistics/period";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyBarChart, ExerciseHoursChart, type WeekHour, type ExerciseHours } from "@/components/stats/charts";
import { PeriodPicker } from "@/components/stats/period-picker";
import { ClassSelect } from "@/components/stats/class-select";

export const dynamic = "force-dynamic";

/**
 * /stats/time — Ctrl_statistics::student_time (1:1): horas por semana (bar)
 * y horas por ejercicio (hbar), opcionalmente filtrado por clase.
 */
export default async function StatsTimePage({
  searchParams,
}: {
  searchParams: Promise<{ classid?: string; userid?: string; start_date?: string; end_date?: string }>;
}) {
  const me = await checkLoggedIn();
  const sp = await searchParams;

  const period = new StatisticsPeriod("long");
  const userid = sp.userid ? Number(sp.userid) : me.id!;
  if (!users.isTeacher(me) && userid !== me.id) throw new DataException("illegal_user_id");

  const classid = sp.classid ? Number(sp.classid) : 0;
  const myclassids = getClassesForUser(userid);
  if (classid > 0 && !myclassids.includes(classid)) throw new DataException("illegal_class_id");

  const myclasses = getClassesByIds(myclassids);

  period.okDates(sp.start_date ?? null, sp.end_date ?? null);
  const start = period.startTimestamp();
  const end = period.endTimestamp();

  const templates =
    classid > 0
      ? stats.getTemplatesForClassAndStudents(classid, [userid])
      : stats.getTemplatesForStudents([userid]);
  const tempId2path = stats.getPathnamesForTemplids(templates);
  const durations = stats.getQuizzesDuration(templates, start, end);

  const total = new Map<number, number>();
  const totaltemp = new Map<string, number>();
  for (let w = period.startWeek(); w < period.endWeek(); w += SECS_PER_WEEK) total.set(w, 0);
  for (const d of durations) {
    const hours = d.duration / 3600;
    const w = StatisticsPeriod.lastMonday(d.start);
    total.set(w, (total.get(w) ?? 0) + hours);
    const name = tempId2path.get(d.templid) ?? `#${d.templid}`;
    totaltemp.set(name, (totaltemp.get(name) ?? 0) + hours);
  }

  const weekData: WeekHour[] = [...total.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, hours]) => ({ week: StatisticsPeriod.formatWeek(w), weekDate: w, hours }));
  const exerciseData: ExerciseHours[] = [...totaltemp.entries()].map(([name, hours]) => ({
    name: name.slice(name.lastIndexOf("/") + 1),
    hours,
  }));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>My time statistics</CardTitle>
          <p className="text-sm text-muted-foreground">
            {users.userFullName(userid)} — {period.startString()} → {period.endString()}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <PeriodPicker startDate={period.startString()} endDate={period.endString()} />
          <ClassSelect classId={classid} classes={myclasses} paramName="classid" />

          <div>
            <h2 className="mb-2 text-base font-semibold">Hours per week</h2>
            <WeeklyBarChart data={weekData} />
          </div>
          <div>
            <h2 className="mb-2 text-base font-semibold">Hours per exercise</h2>
            <ExerciseHoursChart data={exerciseData} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
