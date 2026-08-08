"use client";

import { useActionState } from "react";
import { forgotPwAction, type ActionResult } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPwPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(forgotPwAction, null);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Forgot your user name or password?</CardTitle>
          <CardDescription>
            Specify either your user name or your email address. If you specify both, your user name will be used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state?.sent && (
            <p className="mb-4 rounded border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              An email with instructions on how to reset your password has been sent to you.
            </p>
          )}
          {state?.noEmail && (
            <p className="mb-4 rounded border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              This account has no email address, so your password cannot be reset.
            </p>
          )}
          {state?.error && (
            <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">User name</Label>
              <Input id="username" name="username" autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              Send reset link
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
