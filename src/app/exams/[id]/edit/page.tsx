import Link from "next/link";
import { checkTeacher } from "@/lib/auth/guards";
import { getEditExamAction } from "@/app/actions/exams";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditExamForm } from "./edit-exam-form";

export const dynamic = "force-dynamic";

interface EditExamPageProps {
  params: Promise<{ id: string }>;
}

/** /exams/[id]/edit — Ctrl_exams::edit_exam (1:1): numq/weight/description. */
export default async function EditExamPage({ params }: EditExamPageProps) {
  await checkTeacher();
  const { id } = await params;
  const res = await getEditExamAction(Number(id) || 0);
  if (!res.ok || !res.data) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <Card>
          <CardContent className="pt-6 text-destructive">{res.error}</CardContent>
        </Card>
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Edit exam</CardTitle>
          <Link href="/exams">
            <Button variant="outline" size="sm">Back to exams</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <EditExamForm data={res.data as Parameters<typeof EditExamForm>[0]["data"]} />
        </CardContent>
      </Card>
    </main>
  );
}