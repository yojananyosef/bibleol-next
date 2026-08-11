import { checkLoggedIn } from "@/lib/auth/guards";
import { DataException } from "@/lib/errors";
import * as stats from "@/lib/services/statistics";
import * as users from "@/lib/services/users";
import { StatisticsPeriod } from "@/lib/statistics/period";
import { loadFeatureL10n } from "@/lib/statistics/feature-l10n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DailyScatterChart,
  FeatureBarsChart,
  type DayPoint,
  type FeaturePct,
} from "@/components/stats/charts";
import { PeriodPicker } from "@/components/stats/period-picker";
import { NongradedToggle } from "@/components/stats/nongraded-toggle";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * /stats/exercises — Ctrl_statistics::student_exercise (1:1): % correcto por
 * día (scatter) y % por feature (hbar) de un ejercicio concreto.
 */
export default async function StatsExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ templ?: string; userid?: string; nongraded?: string; start_date?: string; end_date?: string }>;
}) {
  const me = await checkLoggedIn();
  const sp = await searchParams;
  const templ = sp.templ ?? "";
  const nongraded = sp.nongraded === "on";

  const userid = sp.userid ? Number(sp.userid) : me.id!;
  if (!users.isTeacher(me) && userid !== me.id) throw new DataException("illegal_user_id");
  if (templ === "") throw new DataException("templ_required");

  const maySeeNongraded = stats.maySeeNongraded(userid, templ, me.id!);
  const seeNongraded = nongraded && maySeeNongraded;

  const period = new StatisticsPeriod("short");
  period.okDates(sp.start_date ?? null, sp.end_date ?? null);
  const start = period.startTimestamp();
  const end = period.endTimestamp();

  const templs = stats.getTemplidsForPathnameAndUser(templ, userid);
  const resscore = stats.getScoreByDateUserTempl(userid, templs, start, end, seeNongraded);
  const resfeat = stats.getFeaturesByDateUserTempl(userid, templs, start, end, seeNongraded);

  const dbnames = stats.getTemplDb(templs);
  const l10n =
    dbnames && resfeat.size > 0
      ? loadFeatureL10n(dbnames.dbname ?? "", dbnames.dbpropname ?? "", dbnames.qoname ?? "", me.preflang)
      : null;

  const scorePoints: DayPoint[] = resscore.map((r) => ({
    x: r.date,
    y: r.score,
    label: StatisticsPeriod.formatDate(r.date),
    count: 0,
    featpermin: r.featpermin,
  }));
  const featData: FeaturePct[] = [...resfeat.entries()].map(([name, pct]) => ({
    name: l10n?.l10n.emdrosobject?.[dbnames?.qoname ?? ""]?.[name] ?? name,
    pct,
  }));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Exercise statistics</CardTitle>
            <p className="text-sm text-muted-foreground">
              {templ} — {users.userFullName(userid)} — {period.startString()} → {period.endString()}
            </p>
          </div>
          <Link href="/stats" className="text-sm text-primary underline-offset-4 hover:underline">
            All statistics
          </Link>
        </CardHeader>
        <CardContent className="space-y-6">
          <PeriodPicker
            startDate={period.startString()}
            endDate={period.endString()}
            extra={{ templ, userid: String(userid) }}
          />
          {maySeeNongraded && <NongradedToggle checked={nongraded} />}

          <div>
            <h2 className="mb-2 text-base font-semibold">Highest percentage correct by date</h2>
            {scorePoints.length === 0 ? (
              <p className="text-muted-foreground">No data.</p>
            ) : (
              <DailyScatterChart data={scorePoints} />
            )}
          </div>
          <div>
            <h2 className="mb-2 text-base font-semibold">Percentage correct by feature</h2>
            {featData.length === 0 ? (
              <p className="text-muted-foreground">No data.</p>
            ) : (
              <FeatureBarsChart data={featData} />
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
