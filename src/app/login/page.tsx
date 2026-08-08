"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type ActionResult } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(loginAction, null);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Please log in</CardTitle>
          <CardDescription>Bible Online Learner</CardDescription>
        </CardHeader>
        <CardContent>
          {state?.error && (
            <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login_name">User name</Label>
              <Input id="login_name" name="login_name" autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              Log in
            </Button>
          </form>
          <div className="mt-4 space-y-1 text-sm">
            <p>
              <Link href="/forgot-pw" className="text-primary underline-offset-4 hover:underline">
                Forgot your user name or password?
              </Link>
            </p>
            <p>
              <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
                Create new account
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
