import { checkLoggedIn } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrollPanel } from "@/components/classes/enroll-panel";

export const dynamic = "force-dynamic";

/** /enroll — Ctrl_userclass::enroll (1:1): matrícula del estudiante. */
export default async function EnrollPage() {
  await checkLoggedIn();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Enroll in class</CardTitle>
        </CardHeader>
        <CardContent>
          <EnrollPanel />
        </CardContent>
      </Card>
    </main>
  );
}