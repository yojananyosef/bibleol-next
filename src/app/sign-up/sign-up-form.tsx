"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type ActionResult } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface L10n {
  accountCreated: string;
  passwordSent: string;
  goToLogin: string;
  createAccount: string;
  userInformation: string;
  username: string;
  email: string;
  preferredLanguage: string;
  preferredVariant: string;
  none: string;
  submit: string;
}

export function SignUpForm({
  languages,
  variants,
  l10n,
}: {
  languages: { code: string; name: string }[];
  variants: string[];
  l10n: L10n;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(signUpAction, null);

  if (state?.ok) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{l10n.accountCreated}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{state.sent ? l10n.passwordSent : state.error}</p>
            <p className="mt-4">
              <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
                {l10n.goToLogin}
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{l10n.createAccount}</CardTitle>
        </CardHeader>
        <CardContent>
          {state?.error && (
            <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{l10n.username}</Label>
              <Input id="username" name="username" maxLength={20} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{l10n.email}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label>{l10n.preferredLanguage}</Label>
              <Select name="preflang" defaultValue="none">
                <SelectTrigger>
                  <SelectValue placeholder={l10n.none} />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{l10n.preferredVariant}</Label>
              <Select name="prefvariant" defaultValue="none">
                <SelectTrigger>
                  <SelectValue placeholder={l10n.none} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{l10n.none}</SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {l10n.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
