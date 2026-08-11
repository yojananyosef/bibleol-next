import Link from "next/link";
import { checkLoggedIn, checkTeacher } from "@/lib/auth/guards";
import { DataException } from "@/lib/errors";
import * as stats from "@/lib/services/statistics";
import * as users from "@/lib/services/users";
import { getClassById } from "@/lib/services/classes";
import { getNamedUsersInClass } from "@/lib/services/userclass";
import { StatisticsPeriod } from "@/lib/statistics/period";
import { loadFeatureL10n } from "@/lib/statistics/feature-l10n";
import { loadArrayOfGradeSchemes, calculateGrade } from "@/lib/grades/scales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DailyLinesChart, FeatureGroupedBarsChart, CHART_COLORS, type DayPoint } from "@/components/stats/charts";
import { GradeSelector } from "@/components/stats/grade-selector";
import { GradeTable, type GradeStudentRow } from "@/components/stats/grade-table";

export const dynamic = "force-dynamic";

const fmtDate = (ut: number): string => StatisticsPeriod.formatDate(ut);

/**
 * /grades/class/[classid]/exercises — Ctrl_grades::teacher_exercises (1:1):
 * notas por ejercicio de una clase (scatter por día, tabla de notas con
 * detalle por intento, % por feature, export CSV/Excel).
 */
export default async function GradesExercisesPage({
  params,
  searchParams,
}: {
  params: Promise<{ classid: string }>;
  searchParams: Promise<{
    exercise?: string;
    nongraded?: string;
    grade_system?: string;
    max_time?: string;
    start_date?: string;
    end_date?: string;
  }>;
}) {
  const me = await checkLoggedIn();
  const { classid: classidStr } = await params;
  const sp = await searchParams;
  const classid = Number(classidStr);

  const isEnrolled = Boolean(stats.checkIfEnrolled(classid, me.id!));
  if (!isEnrolled) await checkTeacher();

  const classInfo = getClassById(classid, me);
  if (classid <= 0 || (!isEnrolled && classInfo.ownerid !== me.id))
    throw new DataException("illegal_class_id");

  const students = getNamedUsersInClass(classid);
  if (students.length === 0) throw new DataException("no_students_in_class");

  const exerciseList = stats.getPathnamesForClass(classid);
  const nongraded = sp.nongraded === "on";
  const gradeSystem = sp.grade_system ?? "percent";
  let maxTime = sp.max_time ?? "";
  if (maxTime === "") maxTime = "3600";
  const maxTimeNum = Number(maxTime);

  const period = new StatisticsPeriod("short");
  const ex = sp.exercise ?? "";

  const gradeSchemes = loadArrayOfGradeSchemes();
  let status = 2;
  let studentRows: GradeStudentRow[] = [];
  let scoreSeries: { name: string; color: string; points: DayPoint[] }[] = [];
  let speedSeries: { name: string; color: string; points: DayPoint[] }[] = [];
  let featRows: { feature: string; bars: { student: string; color: string; pct: number | null }[] }[] = [];

  if (ex !== "") {
    period.okDates(sp.start_date ?? null, sp.end_date ?? null);
    const start = period.startTimestamp();
    const end = period.endTimestamp();
    const usersAndTempls = stats.getUsersAndTempl(ex, classid);
    const isTeacher = users.isTeacher(me) || users.isAdmin(me);

    const resall: stats.ScoreByDate[][] = [];
    const resallInd: stats.GradeAttempt[][] = [];
    const resfeatall: Map<string, number>[] = [];
    const realUids: number[] = [];

    for (const [uid, templs] of [...usersAndTempls.entries()].sort((a, b) => a[0] - b[0])) {
      if (!isTeacher && me.id! !== uid) continue;
      const seeNongraded = nongraded && stats.maySeeNongraded(uid, ex, me.id!);
      const res = stats.getScoreByDateUserTemplGrades(uid, templs, start, end, seeNongraded);
      const resInd = stats.getScoreByUserTempl(uid, templs, start, end, seeNongraded);
      const resFeat = stats.getFeaturesByDateUserTempl(uid, templs, start, end, seeNongraded);
      if (res.length === 0) continue;
      resall.push(res);
      resallInd.push(resInd);
      resfeatall.push(resFeat);
      realUids.push(uid);
    }
    status = resall.length === 0 ? 0 : 1;

    if (status === 1) {
      const dbnames = stats.getTemplDb([...usersAndTempls.values()].flat());
      const l10n =
        dbnames.dbname !== null
          ? loadFeatureL10n(dbnames.dbname, dbnames.dbpropname ?? "", dbnames.qoname ?? "", me.preflang)
          : null;
      const featloc = l10n?.l10n.emdrosobject?.[dbnames.qoname ?? ""] ?? {};

      studentRows = realUids.map((uid, i) => {
        const email = users.getUserById(uid).email ?? "";
        const attempts = resallInd[i].map((a) => {
          const totFeatpMin = a.featpermin <= 0 ? -1 : 60 / a.featpermin;
          const grade =
            Math.round(totFeatpMin) <= maxTimeNum
              ? calculateGrade(gradeSystem, a.perc)
              : calculateGrade(gradeSystem, 0);
          return {
            time: a.start,
            percentage: a.perc,
            duration: a.duration,
            avgPerQi: Math.round(totFeatpMin),
            grade,
            quizzid: a.id,
            userid: uid,
          };
        });
        const hgstGrade = attempts[0]?.grade ?? "-";
        return { name: users.userFullName(uid), email, attempts, hgstGrade };
      });

      scoreSeries = realUids.map((uid, i) => ({
        name: users.userFullName(uid),
        color: CHART_COLORS[i % CHART_COLORS.length],
        points: resall[i].map((r) => ({
          x: r.date,
          y: r.score,
          label: fmtDate(r.date),
          count: 0,
          featpermin: r.featpermin,
        })),
      }));
      speedSeries = realUids.map((uid, i) => ({
        name: users.userFullName(uid),
        color: CHART_COLORS[i % CHART_COLORS.length],
        points: resall[i].map((r) => ({
          x: r.date,
          y: r.featpermin,
          label: fmtDate(r.date),
          count: 0,
          featpermin: r.featpermin,
        })),
      }));

      const featNames = new Map<string, number[]>();
      resfeatall.forEach((m, i) => {
        for (const [name, pct] of m) {
          const list = featNames.get(name) ?? [];
          list[i] = pct;
          featNames.set(name, list);
        }
      });
      featRows = [...featNames.entries()].map(([name, pcts]) => ({
        feature: featloc[name] ?? name,
        bars: realUids.map((_uid, i) => ({
          student: users.userFullName(realUids[i]),
          color: CHART_COLORS[i % CHART_COLORS.length],
          pct: pcts[i] ?? null,
        })),
      }));
    }
  }

  const startDate = status === 2 ? "" : period.startString();
  const endDate = status === 2 ? "" : period.endString();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Statistics for class: {classInfo.classname}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {ex !== "" ? `Exercise: ${ex}` : "Select an exercise"}
            </p>
          </div>
          <Link href="/grades" className="text-sm text-primary underline-offset-4 hover:underline">
            All classes
          </Link>
        </CardHeader>
        <CardContent className="space-y-6">
          <GradeSelector
            exercise={ex}
            exerciseList={exerciseList}
            gradeSchemes={gradeSchemes}
            gradeSystem={gradeSystem}
            maxTime={sp.max_time ?? ""}
            nongraded={nongraded}
            startDate={startDate}
            endDate={endDate}
            extra={{ classid: String(classid) }}
          />

          {status === 2 && <p className="text-muted-foreground">Select an exercise and press OK.</p>}
          {status === 0 && <p className="text-muted-foreground">No data.</p>}
          {status === 1 && (
            <>
              <div>
                <h2 className="mb-2 text-base font-semibold">Highest percentage correct by date</h2>
                <DailyLinesChart series={scoreSeries} />
              </div>
              <div>
                <h2 className="mb-2 text-base font-semibold">Highest speed by date</h2>
                <DailyLinesChart series={speedSeries} domain={[0, "auto"]} />
              </div>

              <div>
                <h2 className="mb-2 text-base font-semibold">Grades for exercise: {ex}</h2>
                <GradeTable
                  tableId="grading_table"
                  students={studentRows}
                  filename={classInfo.classname}
                  detailHrefPrefix={`/grades/class/${classid}/quiz/`}
                />
              </div>

              <div>
                <h2 className="mb-2 text-base font-semibold">Percentage correct by feature</h2>
                {featRows.length === 0 ? (
                  <p className="text-muted-foreground">No data.</p>
                ) : (
                  <FeatureGroupedBarsChart data={featRows} />
                )}
                <Table className="mt-3">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-center">Correct</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {featRows.flatMap((f) =>
                      f.bars.map((b, j) => (
                        <TableRow key={`${f.feature}-${j}`}>
                          <TableCell>{f.feature}</TableCell>
                          <TableCell>{b.student}</TableCell>
                          <TableCell className="text-center">
                            {b.pct === null ? "-" : `${Math.round(b.pct)}%`}
                          </TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
