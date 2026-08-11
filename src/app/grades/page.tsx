import Link from "next/link";
import { checkLoggedIn } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { getNamedClassesOwned, getNamedClassesEnrolled } from "@/lib/services/classes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * /grades — Ctrl_grades::teacher_grades / student_grades (1:1): lista de
 * clases con acceso a las notas (propias si es profesor, matriculadas
 * si es alumno).
 */
export default async function GradesPage() {
  const me = await checkLoggedIn();
  const isTeacher = users.isTeacher(me) || users.isAdmin(me);
  const classes = isTeacher ? getNamedClassesOwned(me) : getNamedClassesEnrolled(me);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Grades</CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-muted-foreground">No classes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Grouped by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((cl) => (
                  <TableRow key={cl.id}>
                    <TableCell className="font-medium">{cl.classname}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/grades/class/${cl.id}/exercises`}>
                          <Badge className="cursor-pointer">Exercises</Badge>
                        </Link>
                        <Link href={`/grades/class/${cl.id}/exams`}>
                          <Badge className="cursor-pointer">Exams</Badge>
                        </Link>
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
