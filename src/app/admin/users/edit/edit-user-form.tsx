"use client";

import Link from "next/link";
import { useActionState } from "react";
import { adminSaveUserAction, type ActionResult } from "@/app/actions/auth";
import { MIN_PW_LENGTH } from "@/lib/auth/password";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EditUserForm({
  me,
  user,
  extras,
  languages,
  variants,
}: {
  me: { isadmin: boolean; isteacher: boolean; istranslator: boolean };
  user: {
    id: number | null;
    isNew: boolean;
    username: string;
    first_name: string;
    last_name: string;
    family_name_first: boolean;
    email: string;
    preflang: string;
    prefvariant: string;
    isadmin: boolean;
    isteacher: boolean;
    istranslator: boolean;
    oauth2_login: string | null;
  };
  extras: { offset: number; orderby: string; sortorder: "asc" | "desc" };
  languages: { code: string; name: string }[];
  variants: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(adminSaveUserAction, null);
  const back = `/admin/users?offset=${extras.offset}&orderby=${extras.orderby}&${extras.sortorder}`;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{user.isNew ? "Add user" : `Edit user: ${user.username}`}</CardTitle>
        </CardHeader>
        <CardContent>
          {state?.error && (
            <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="userid" value={user.id ?? -1} />
            <input type="hidden" name="offset" value={extras.offset} />
            <input type="hidden" name="orderby" value={extras.orderby} />
            <input type="hidden" name="sortorder" value={extras.sortorder} />

            {user.isNew && (
              <div className="space-y-2">
                <Label htmlFor="username">User name</Label>
                <Input id="username" name="username" maxLength={20} required />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" name="first_name" defaultValue={user.first_name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" name="last_name" defaultValue={user.last_name} required />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="family_name_first" defaultChecked={user.family_name_first} />
              Family name first (no space)
            </label>
            {me.isadmin && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="isadmin" defaultChecked={user.isadmin} />
                Administrator
              </label>
            )}
            {me.isteacher && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="isteacher" defaultChecked={user.isteacher} />
                Teacher
              </label>
            )}
            {me.istranslator && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="istranslator" defaultChecked={user.istranslator} />
                Translator
              </label>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={user.email} />
            </div>
            <div className="space-y-2">
              <Label>Preferred language</Label>
              <Select name="preflang" defaultValue={user.preflang || "none"}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
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
              <Label>Preferred variant</Label>
              <Select name="prefvariant" defaultValue={user.prefvariant || "none"}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password1">
                  {user.isNew ? "Password" : "New password"}
                </Label>
                <Input
                  id="password1"
                  name="password1"
                  type="password"
                  autoComplete="new-password"
                  placeholder={user.isNew ? `Min ${MIN_PW_LENGTH} characters` : undefined}
                  required={user.isNew}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">
                  {user.isNew ? "Repeat password" : "Repeat new password"}
                </Label>
                <Input id="password2" name="password2" type="password" autoComplete="new-password" required={user.isNew} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                Save
              </Button>
              <Link href={back} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                Back to user list
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
