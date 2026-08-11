"use client";

/** OAuth2Profile — Port de view_oauth2_profile + view_oauth2_profile_left:
 * perfil de usuario OAuth2 con nombre/email de solo lectura (los gestiona el
 * proveedor) y borrado de cuenta (users/delete_me_google|facebook). */

import Link from "next/link";
import { useActionState } from "react";
import { deleteMeOauth2Action, editOauth2ProfileAction, type ActionResult } from "@/app/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface OAuth2L10n {
  youLogin: string;
  first: string;
  last: string;
  familyNameFirst: string;
  yes: string;
  no: string;
  email: string;
  preferredLanguage: string;
  noLanguage: string;
  preferredVariant: string;
  save: string;
  cancel: string;
  changeThrough: string;
  deleteConfirm: string;
  deleteNote: string;
  deleteProfile: string;
}

export function OAuth2Profile({
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
  l10n: OAuth2L10n;
}) {
  const authority = user.oauth2_login === "facebook" ? "facebook" : "google";
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(editOauth2ProfileAction, null);
  const [delState, delAction] = useActionState<ActionResult | null, FormData>(deleteMeOauth2Action, null);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 gap-6 p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{l10n.youLogin}</CardTitle>
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
                <Label>{l10n.first}</Label>
                <p className="text-sm">{user.first_name}</p>
              </div>
              <div className="space-y-2">
                <Label>{l10n.last}</Label>
                <p className="text-sm">{user.last_name}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{l10n.familyNameFirst}</Label>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="family_name_first" value="yes" defaultChecked={user.family_name_first} />
                  {l10n.yes}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="family_name_first" value="no" defaultChecked={!user.family_name_first} />
                  {l10n.no}
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{l10n.email}</Label>
              <p className="text-sm">{user.email || "—"}</p>
            </div>
            <div className="space-y-2">
              <Label>{l10n.preferredLanguage}</Label>
              <Select name="preflang" defaultValue={user.preflang || "none"}>
                <SelectTrigger>
                  <SelectValue placeholder={l10n.noLanguage} />
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
                  <SelectValue placeholder={l10n.preferredVariant} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {l10n.save}
              </Button>
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                {l10n.cancel}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <aside className="w-64 shrink-0">
        <p className="mb-4 text-sm text-muted-foreground">{l10n.changeThrough}</p>
        <form action={delAction} className="space-y-3">
          <input type="hidden" name="authority" value={authority} />
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="confirm_delete" required className="mt-0.5" />
            <span>{l10n.deleteConfirm}</span>
          </label>
          <p className="text-xs text-muted-foreground">{l10n.deleteNote}</p>
          <Button type="submit" variant="destructive" size="sm">
            {l10n.deleteProfile}
          </Button>
        </form>
      </aside>
    </main>
  );
}