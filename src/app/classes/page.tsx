import Link from "next/link";
import { checkTeacher } from "@/lib/auth/guards";
import { getClassesListAction } from "@/app/actions/classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClassOps } from "./class-ops";

export const dynamic = "force-dynamic";

export type ClassListRow = {
  id: number;
  clid: number;
  classname: string;
  password: string | null;
  clpass: string | null;
  enrol_before: string | null;
  ownerid: number;
  priority: number;
  uid: number | null;
  owner_name: string;
};

/** /classes — Ctrl_classes::classes (1:1): lista para profesores. */
export default async function ClassesPage() {
  await checkTeacher();
  const res = await getClassesListAction();
  if (!res.ok || !res.data) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <Card>
          <CardContent className="pt-6 text-destructive">{res.error}</CardContent>
        </Card>
      </main>
    );
  }
  const d = res.data as { allclasses: ClassListRow[]; teachers: Array<{ id: number; name: string }>; myid: number; isadmin: boolean };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Classes</CardTitle>
          <Link href="/classes/-1">
            <Button variant="outline" size="sm">Add class</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class name</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Enroll before</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Operations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.allclasses.map((cl) => {
                const mine = d.myid === cl.ownerid || d.isadmin;
                return (
                  <TableRow key={cl.clid}>
                    <TableCell className="font-medium">{cl.classname}</TableCell>
                    <TableCell>
                      {mine ? (cl.clpass === null || cl.clpass === "" ? "-" : cl.clpass) : "•••"}
                    </TableCell>
                    <TableCell>{cl.enrol_before === null || cl.enrol_before === "" ? "-" : cl.enrol_before}</TableCell>
                    <TableCell>{cl.ownerid === 0 ? "No owner" : cl.owner_name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {mine && (
                          <>
                            <Link href={`/classes/${cl.clid}/users`}>
                              <Badge className="cursor-pointer">Assign users</Badge>
                            </Link>
                            <Link href={`/classes/${cl.clid}`}>
                              <Badge className="cursor-pointer">Edit</Badge>
                            </Link>
                            <ClassOps classId={cl.clid} className_={cl.classname} isAdmin={d.isadmin} teachers={d.teachers} />
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}