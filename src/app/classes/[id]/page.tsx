import Link from "next/link";
import { getClassEditAction } from "@/app/actions/classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClassEditForm } from "../../../components/classes/class-edit-form";

export const dynamic = "force-dynamic";

/**
 * /classes/[id] — Ctrl_classes::edit_one_class: formulario de creación/
 * edición de clase (id=-1 = nueva). El envío es server action.
 */
export default async function ClassEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const classid = Number(id) || -1;
  const res = await getClassEditAction(classid);

  if (!res.ok && !res.data) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 p-6">
        <Card>
          <CardContent className="pt-6 text-destructive">{res.error}</CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{classid === -1 ? "Add class" : "Edit class"}</CardTitle>
          {classid !== -1 && (
            <Link href={`/classes/${classid}/users`}>
              <Badge className="cursor-pointer">Assign users</Badge>
            </Link>
          )}
        </CardHeader>
        <CardContent>
          <ClassEditForm classid={classid} info={res.data as { id: number; classname: string; password: string | null; enrol_before: string | null }} />
          <div className="mt-3">
            <Link href="/classes">
              <Button variant="outline" size="sm">Cancel</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}