import Link from "next/link";
import { checkLoggedIn } from "@/lib/auth/guards";
import { getExamInstancesForUser } from "@/lib/services/exams";
import * as users from "@/lib/services/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteExamInstance } from "./delete-instance";

export const dynamic = "force-dynamic";

const fmt = (ts: number): string =>
  new Date(ts * 1000).toString().split(" (")[0];

/**
 * /exams/active — Ctrl_exams::active_exams (1:1): instancias de examen por
 * clase en pestañas Active/Future (los alumnos ven solo las de sus clases y
 * sin terminadas; los profesores pueden borrar instancias).
 */
export default async function ActiveExamsPage() {
  const me = await checkLoggedIn();
  const { classes, instances } = getExamInstancesForUser(me);
  const now = Math.floor(new Date().getTime() / 1000);
  const isTeacher = users.isTeacher(me) || users.isAdmin(me);

  const rows = classes.flatMap((c) =>
    (instances[c.id] ?? []).map((r) => {
      const stage = r.exam_start_time > now ? "future" : r.exam_end_time <= now ? "past" : "active";
      return { c, r, stage };
    }),
  );
  const active = rows.filter((x) => x.stage === "active");
  const future = rows.filter((x) => x.stage === "future");

  const render = (list: typeof rows) =>
    list.map(({ c, r }) => (
      <Card key={r.id}>
        <CardContent className="flex items-center justify-between gap-3 pt-6 text-sm">
          <div>
            <p className="font-medium">{r.instance_name || r.exam_name}</p>
            <p className="text-muted-foreground">
              {c.name} — {c.instructor === "None" ? "None" : `Instructor: ${c.instructor}`}
            </p>
            <p className="text-muted-foreground">
              {fmt(r.exam_start_time)} → {fmt(r.exam_end_time)}
              {r.exam_length !== null && r.exam_length !== undefined ? ` — ${r.exam_length} min` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.finished && !isTeacher && <Badge variant="secondary">Completed</Badge>}
            {!r.finished && <Link href={`/exams/take?exam=${r.id}`}><Button size="sm">Take exam</Button></Link>}
            {isTeacher && <DeleteExamInstance id={r.id} />}
          </div>
        </CardContent>
      </Card>
    ));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Active exams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="future">Future</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="space-y-3">
              {active.length === 0 ? <p className="text-sm text-muted-foreground">No active exams.</p> : render(active)}
            </TabsContent>
            <TabsContent value="future" className="space-y-3">
              {future.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming exams.</p> : render(future)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}