import Link from "next/link";
import { checkLoggedIn, checkTeacher } from "@/lib/auth/guards";
import { getQuizDetail } from "@/lib/services/statistics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * /grades/class/[classid]/quiz/[quizzid] — Ctrl_grades::teacher_quizz_detail
 * (1:1): detalle por pregunta de un intento (view_get_quizz_details).
 */
export default async function QuizDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ classid: string; quizzid: string }>;
  searchParams: Promise<{ userid?: string }>;
}) {
  const me = await checkLoggedIn();
  const { classid, quizzid } = await params;
  const sp = await searchParams;
  const userid = Number(sp.userid ?? me.id!);
  if (userid !== me.id!) await checkTeacher();

  const detail = getQuizDetail(userid, Number(quizzid));

  function hintOf(d: (typeof detail)[number]): string {
    const types = (d.disp_type ?? "").split(",");
    const values = (d.disp_value ?? "").split(",");
    const i = types.indexOf("hint");
    return i >= 0 ? (values[i] ?? "") : (values[0] ?? "");
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Exercise detail</CardTitle>
          <Link href={`/grades/class/${classid}/exercises`}>
            <Button variant="outline" size="sm">
              Back
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Text</TableHead>
                <TableHead>Question object</TableHead>
                <TableHead className="text-center">Requested</TableHead>
                <TableHead className="text-center">Right/Wrong</TableHead>
                <TableHead className="text-center">Correct answer</TableHead>
                <TableHead className="text-center">Answer by student</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.map((d, i) => (
                <TableRow key={i}>
                  <TableCell className="text-center">
                    {d.qono}.{d.subqono}
                  </TableCell>
                  <TableCell className="text-center">{d.location}</TableCell>
                  <TableCell className="text-center">{d.txt}</TableCell>
                  <TableCell className="text-center">{hintOf(d)}</TableCell>
                  <TableCell className="text-center">{d.name}</TableCell>
                  <TableCell className="text-center">{d.correct}</TableCell>
                  <TableCell className="text-center">{d.value}</TableCell>
                  <TableCell className="text-center">{d.answer}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
