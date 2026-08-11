import Link from "next/link";
import { checkTeacher } from "@/lib/auth/guards";
import { getClassEditAction } from "@/app/actions/classes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersInClassForm } from "./users-in-class-form";

export const dynamic = "force-dynamic";

/**
 * /classes/[id]/users — Ctrl_userclass::users_in_class: asignación de
 * usuarios a la clase (checkboxes en dos columnas, como el legacy).
 */
export default async function UsersInClassPage({ params }: { params: Promise<{ id: string }> }) {
  await checkTeacher();
  const { id } = await params;
  const classid = Number(id) || 0;
  const res = await getClassEditAction(classid);

  if (!res.ok || !res.data) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <Card>
          <CardContent className="pt-6 text-destructive">{res.error}</CardContent>
        </Card>
      </main>
    );
  }
  const info = res.data as { id: number; classname: string };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Users in class — {info.classname}</CardTitle>
          <Link href="/classes">
            <Button variant="outline" size="sm">Back to classes</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <UsersInClassForm classid={classid} />
        </CardContent>
      </Card>
    </main>
  );
}