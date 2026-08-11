"use client";

import { useActionState } from "react";
import { deleteMeAction, editProfileAction, type ActionResult } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface L10n {
  title: string;
  firstName: string;
  lastName: string;
  familyNameFirst: string;
  email: string;
  preferredLanguage: string;
  preferredVariant: string;
  none: string;
  newPassword: string;
  repeatNewPassword: string;
  leaveBlank: string;
  save: string;
  deleteProfile: string;
}

export function ProfileForm({
  user,
  languages,
  variants,
  l10n,
}: {
  user: {
    first_name: string;
    last_name: string;
    family_name_first: boolean;
    email: string;
    preflang: string;
    prefvariant: string;
    oauth2_login: string | null;
  };
  languages: { code: string; name: string }[];
  variants: string[];
  l10n: L10n;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(editProfileAction, null);
  const [delState, delAction] = useActionState<ActionResult | null, FormData>(deleteMeAction, null);

  return (
    <main className="flex flex-1 justify-center p-6">
      <Card className="w-full max-w-lg self-start">
        <CardHeader>
          <CardTitle>{l10n.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state?.error && (
            <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {delState?.error && (
            <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {delState.error}
            </p>
          )}
          <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">{l10n.firstName}</Label>
                <Input id="first_name" name="first_name" defaultValue={user.first_name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">{l10n.lastName}</Label>
                <Input id="last_name" name="last_name" defaultValue={user.last_name} required />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="family_name_first" defaultChecked={user.family_name_first} />
              {l10n.familyNameFirst}
            </label>
            <div className="space-y-2">
              <Label htmlFor="email">{l10n.email}</Label>
              <Input id="email" name="email" type="email" defaultValue={user.email} />
            </div>
            <div className="space-y-2">
              <Label>{l10n.preferredLanguage}</Label>
              <Select name="preflang" defaultValue={user.preflang || "none"}>
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
              <Select name="prefvariant" defaultValue={user.prefvariant || "none"}>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password1">{l10n.newPassword}</Label>
                <Input id="password1" name="password1" type="password" autoComplete="new-password" placeholder={`${l10n.leaveBlank}`} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">{l10n.repeatNewPassword}</Label>
                <Input id="password2" name="password2" type="password" autoComplete="new-password" />
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              {l10n.save}
            </Button>
          </form>

          <form action={delAction} className="border-t pt-4">
            <Button type="submit" variant="destructive" size="sm" disabled={!!user.oauth2_login}>
              {l10n.deleteProfile}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
