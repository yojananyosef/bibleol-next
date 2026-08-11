import Link from "next/link";
import { checkTeacher } from "@/lib/auth/guards";
import { getManageExamsAction } from "@/app/actions/exams";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateInstanceDialog } from "./create-instance";
import { DeleteExam } from "./delete-exam";

export const dynamic = "force-dynamic";

export type ManageExamRow = {
  id: number;
  exam_name: string;
  display_name: string;
  ownerid: number;
  owner_name: string;
  can_edit: boolean;
};

/** /exams — Ctrl_exams::manage_exams (1:1): gestión de exámenes (solo profesores). */
export default async function ExamsPage() {
  await checkTeacher();
  const res = await getManageExamsAction();
  if (!res.ok || !res.data) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <Card>
          <CardContent className="pt-6 text-destructive">{res.error}</CardContent>
        </Card>
      </main>
    );
  }
  const d = res.data as {
    exams: ManageExamRow[];
    classes: Array<{ id: number; name: string }>;
    isadmin: boolean;
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Exam management</CardTitle>
          <div className="flex items-center gap-2">
            <Link href="/exams/active">
              <Button variant="outline" size="sm">Active exams</Button>
            </Link>
            <Link href="/exams/new">
              <Button variant="outline" size="sm">New exam</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {d.exams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exams yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Operations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.exams.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.display_name}</TableCell>
                    <TableCell>{e.owner_name || "None"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {e.can_edit && (
                          <>
                            <Link href={`/exams/${e.id}/edit`}>
                              <Badge className="cursor-pointer">Edit</Badge>
                            </Link>
                            <CreateInstanceDialog
                              examId={e.id}
                              examName={e.exam_name}
                              classes={d.classes}
                            />
                            <DeleteExam id={e.id} name={e.display_name} />
                          </>
                        )}
                      </div>
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