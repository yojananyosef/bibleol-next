import Link from "next/link";
import { checkTeacher } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewExamForm } from "./new-exam-form";

export const dynamic = "force-dynamic";

/** /exams/new — creación de examen (1:1 con el modal del file_manager legacy). */
export default async function NewExamPage() {
  await checkTeacher();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>New exam</CardTitle>
          <Link href="/exams">
            <Button variant="outline" size="sm">Back to exams</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <NewExamForm />
        </CardContent>
      </Card>
    </main>
  );
}