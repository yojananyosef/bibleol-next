"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type ActionResult } from "@/app/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface L10n {
  title: string;
  subtitle: string;
  username: string;
  password: string;
  submit: string;
  forgot: string;
  create: string;
  google: string;
  facebook: string;
}

export function LoginForm({
  l10n,
  googleEnabled,
  facebookEnabled,
}: {
  l10n: L10n;
  googleEnabled: boolean;
  facebookEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(loginAction, null);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{l10n.title}</CardTitle>
          <CardDescription>{l10n.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {state?.error && (
            <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login_name">{l10n.username}</Label>
              <Input id="login_name" name="login_name" autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{l10n.password}</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {l10n.submit}
            </Button>
          </form>
          <div className="mt-4 space-y-1 text-sm">
            <p>
              <Link href="/forgot-pw" className="text-primary underline-offset-4 hover:underline">
                {l10n.forgot}
              </Link>
            </p>
            <p>
              <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
                {l10n.create}
              </Link>
            </p>
          </div>
          {(googleEnabled || facebookEnabled) && (
            <div className="mt-4 space-y-2 border-t pt-4">
              {googleEnabled && (
                <Link href="/oauth2/start?authority=google" className={buttonVariants({ variant: "outline", className: "w-full" })}>
                  {l10n.google}
                </Link>
              )}
              {facebookEnabled && (
                <Link href="/oauth2/start?authority=facebook" className={buttonVariants({ variant: "outline", className: "w-full" })}>
                  {l10n.facebook}
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
