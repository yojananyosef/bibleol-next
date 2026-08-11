import Link from "next/link";
import { checkLoggedIn, checkTeacher } from "@/lib/auth/guards";
import { DataException } from "@/lib/errors";
import * as stats from "@/lib/services/statistics";
import * as users from "@/lib/services/users";
import { getClassById } from "@/lib/services/classes";
import { StatisticsPeriod } from "@/lib/statistics/period";
import { loadArrayOfGradeSchemes, calculateGrade } from "@/lib/grades/scales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeSelector } from "@/components/stats/grade-selector";
import { GradeTable, type GradeStudentRow } from "@/components/stats/grade-table";

export const dynamic = "force-dynamic";

/**
 * /grades/class/[classid]/exams — Ctrl_grades::teacher_exam (1:1): notas por
 * examen (ponderadas por peso del examcode), con detalle por ejercicio.
 */
export default async function GradesExamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classid: string }>;
  searchParams: Promise<{
    exam?: string;
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
  const isGrader = users.isGrader(classid, me.id!);
  if (classid <= 0 || (!isEnrolled && classInfo.ownerid !== me.id && !isGrader))
    throw new DataException("illegal_class_id");

  const examList = stats.getExamsForClass(classid);
  const nongraded = sp.nongraded === "on";
  const gradeSystem = sp.grade_system ?? "percent";
  let maxTime = sp.max_time ?? "";
  if (maxTime === "") maxTime = "3600";
  const maxTimeNum = Number(maxTime);

  const period = new StatisticsPeriod("short");
  const ex = sp.exam ?? "";
  const gradeSchemes = loadArrayOfGradeSchemes();

  let status = 2;
  let studentRows: GradeStudentRow[] = [];

  if (ex !== "") {
    period.okDates(sp.start_date ?? null, sp.end_date ?? null);
    const activeExamId = Number(ex);
    const userids = stats.getUsersAndExamResults(activeExamId);
    const isTeacher = users.isTeacher(me) || users.isAdmin(me);

    const resall: stats.ExamAttempt[][] = [];
    const realUids: number[] = [];

    for (const uid of [...userids].sort((a, b) => a - b)) {
      if (!isTeacher && !isGrader && me.id! !== uid) continue;
      const seeNongraded = nongraded && stats.maySeeNongraded(uid, String(activeExamId), me.id!);
      const res = stats.getScoreByUserActiveExam(uid, [activeExamId], seeNongraded);
      if (res.length === 0) continue;
      resall.push(res);
      realUids.push(uid);
    }
    status = resall.length === 0 ? 0 : 1;

    if (status === 1) {
      studentRows = realUids.map((uid) => {
        const attempts = resall[realUids.indexOf(uid)];
        let ncounter = 0;
        let startTime = 0;
        let totFeatpMin = 0;
        let totWeight = 0;
        let totPercWeighted = 0;
        for (const a of attempts) {
          ncounter += 1;
          if (startTime === 0) startTime = a.start;
          totFeatpMin += a.featpermin <= 0 ? -1 : 60 / a.featpermin;
          totWeight += a.weight;
          totPercWeighted += a.perc * a.weight;
        }
        const weightedPct = totPercWeighted / totWeight;
        const hgstGrade =
          Math.round(totFeatpMin) <= maxTimeNum
            ? calculateGrade(gradeSystem, weightedPct)
            : calculateGrade(gradeSystem, 0);
        const avgPerQi = totFeatpMin > 0 ? 60 / (totFeatpMin / ncounter) : 0;
        const rows = attempts.map((a) => {
          const grade =
            Math.round(totFeatpMin) <= maxTimeNum
              ? calculateGrade(gradeSystem, a.perc)
              : calculateGrade(gradeSystem, 0);
          return {
            time: a.start,
            percentage: a.perc,
            duration: a.duration,
            avgPerQi,
            grade,
            quizzid: a.id,
            userid: uid,
          };
        });
        return {
          name: users.userFullName(uid),
          email: users.getUserById(uid).email ?? "",
          attempts: rows,
          hgstGrade,
        };
      });
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
              {ex !== "" ? `Exam: ${examList.find((e) => e.id === Number(ex))?.name ?? ex}` : "Select an exam"}
            </p>
          </div>
          <Link href="/grades" className="text-sm text-primary underline-offset-4 hover:underline">
            All classes
          </Link>
        </CardHeader>
        <CardContent className="space-y-6">
          <GradeSelector
            exercise={ex}
            exerciseList={examList.map((e) => String(e.id))}
            gradeSchemes={gradeSchemes}
            gradeSystem={gradeSystem}
            maxTime={sp.max_time ?? ""}
            nongraded={nongraded}
            startDate={startDate}
            endDate={endDate}
            extra={{ classid: String(classid) }}
          />

          {status === 2 && <p className="text-muted-foreground">Select an exam and press OK.</p>}
          {status === 0 && <p className="text-muted-foreground">No data.</p>}
          {status === 1 && (
            <div>
              <h2 className="mb-2 text-base font-semibold">Grades for exam</h2>
              <GradeTable
                tableId="grading_table"
                students={studentRows}
                filename={classInfo.classname}
                detailHrefPrefix={`/grades/class/${classid}/quiz/`}
              />
              {nongraded && <p className="mt-2 text-xs text-muted-foreground">* = includes non-graded</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
