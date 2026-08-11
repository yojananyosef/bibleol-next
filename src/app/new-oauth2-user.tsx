"use client";

/** new-oauth2-user.tsx — Port de view_new_oauth2_user.php: primer login OAuth2,
 * pide aceptar la política; "No" borra la cuenta vía oauth2/accept_policy_no. */

import Link from "next/link";
import { useActionState } from "react";
import { acceptPolicyYesAction, type ActionResult } from "@/app/actions/auth";
import type { UserRow } from "@/lib/services/users";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PolicyText } from "./policy-text";

export function NewOAuth2User({
  me,
  policyText,
  policyLang,
  l10n,
}: {
  me: UserRow;
  policyText: string;
  policyLang: string;
  l10n: {
    welcomeHead: string;
    yourName: string;
    yourNameNoEmail: string;
    enjoy: string;
    firstYouMustAccept: string;
    doYouAccept: string;
    yes: string;
    no: string;
  };
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(acceptPolicyYesAction, null);
  const fullName = `${me.first_name} ${me.last_name}`;
  const yourName = me.email
    ? l10n.yourName.replace("%s", fullName).replace("%s", me.email)
    : l10n.yourNameNoEmail.replace("%s", fullName);

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b px-6 py-3 text-lg font-semibold">Bible Online Learner</header>
      <section className="mx-auto w-full max-w-2xl flex-1 p-8">
        <h1 className="mb-4 text-2xl font-semibold">{l10n.welcomeHead}</h1>
        <p className="text-muted-foreground">{yourName}</p>
        <p className="text-muted-foreground">{l10n.enjoy}</p>
        <p className="mb-4 text-muted-foreground">{l10n.firstYouMustAccept}</p>
        <PolicyText text={policyText} lang={policyLang} />
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">{l10n.doYouAccept}</CardTitle>
          </CardHeader>
          <CardContent>
            {state?.error && (
              <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            <form action={formAction} className="flex items-center gap-3">
              <input type="hidden" name="acceptance_code" value={me.acc_code ?? ""} />
              <input type="hidden" name="policy_lang" value={policyLang} />
              <Button type="submit">{l10n.yes}</Button>
              <Link href={`/oauth2/accept_policy_no?acceptance_code=${me.acc_code ?? ""}`} className={buttonVariants({ variant: "outline" })}>
                {l10n.no}
              </Link>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}