import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resetAction } from "@/app/actions/auth";

export default async function ResetPage({ params }: PageProps<"/reset/[key]">) {
  const key = (await params).key;
  const result = await resetAction(key);

  if (result.linkBad) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Cannot reset password</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">The reset link is bad or has expired.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (result.noEmail) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Cannot reset password</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This account has no email address, so your password cannot be reset.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  redirect("/login");
}
