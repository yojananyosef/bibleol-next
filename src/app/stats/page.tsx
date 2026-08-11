import Link from "next/link";
import { checkLoggedIn } from "@/lib/auth/guards";
import * as stats from "@/lib/services/statistics";
import { loadFeatureL10n, localizeValue } from "@/lib/statistics/feature-l10n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const fmtTime = (s: string): string => s.replace("T", " ").slice(0, 19);

const fmtDuration = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/**
 * /stats — Ctrl_statistics::show_stat (1:1): para cada ejercicio con quizzes
 * terminados, una tabla de intentos y una tabla de features (view_statistics).
 */
export default async function StatsPage() {
  const me = await checkLoggedIn();
  const templates = stats.allTemplates(me.id!);

  const rows = templates.map((t) => {
    const quizzes = stats.allQuizzes(t.qtid);
    const feats = stats.allReqFeatures(t.qtid);
    const l10n = loadFeatureL10n(t.dbname ?? "", t.dbpropname ?? "", t.qoname ?? "", me.preflang);
    return { t, quizzes, feats, l10n };
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>My statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {rows.length === 0 && <p className="text-muted-foreground">No quizzes yet.</p>}
          {rows.map(({ t, quizzes, feats, l10n }, i) => {
            const filename = t.pathname.slice(t.pathname.lastIndexOf("/") + 1);
            return (
              <div key={t.qtid}>
                {i > 0 && <hr className="my-6" />}
                <h2 className="mb-3 text-lg font-semibold">Exercise file: {filename}</h2>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Sec per correct</TableHead>
                      <TableHead>Correct</TableHead>
                      <TableHead>Wrong</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quizzes.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell>{q.id}</TableCell>
                        <TableCell>{fmtTime(q.time)}</TableCell>
                        <TableCell>{fmtDuration(q.duration)}</TableCell>
                        <TableCell>{q.correct === 0 ? "-" : (q.duration / q.correct).toFixed(2)}</TableCell>
                        <TableCell>{q.correct}</TableCell>
                        <TableCell>{q.wrong}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Table className="mt-5">
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Correct answer</TableHead>
                      <TableHead>Mistakes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feats.map((rf) => (
                      <TableRow key={rf.name}>
                        <TableCell>{rf.id}</TableCell>
                        <TableCell>
                          {l10n?.l10n.emdrosobject?.[t.qoname ?? ""]?.[rf.name] ?? rf.name}
                        </TableCell>
                        <TableCell>
                          {l10n
                            ? localizeValue(l10n.l10n, l10n.obj2feat, t.qoname ?? "", rf.name, rf.value)
                            : rf.value}
                        </TableCell>
                        <TableCell>{rf.cnt}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Link
                  href={`/stats/exercises?templ=${encodeURIComponent(t.pathname.replace(/\.3et$/, ""))}`}
                  className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
                >
                  Exercise graph
                </Link>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
