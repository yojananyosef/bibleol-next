"use client";

import { useActionState } from "react";
import { acceptPolicyNoAction, acceptPolicyYesAction, type ActionResult } from "@/app/actions/auth";
import type { UserRow } from "@/lib/services/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PolicyText } from "./policy-text";

export function PolicyAccept({ me }: { me: UserRow }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(acceptPolicyYesAction, null);

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b px-6 py-3 text-lg font-semibold">Bible Online Learner</header>
      <section className="mx-auto w-full max-w-2xl flex-1 p-8">
        <h1 className="mb-1 text-2xl font-semibold">New privacy policy</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Before you can use Bible Online Learner, you must accept the current privacy policy.
        </p>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Do you accept the privacy policy?</CardTitle>
          </CardHeader>
          <CardContent>
            <PolicyText />
            {state?.error && (
              <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            <form action={formAction}>
              <input type="hidden" name="acceptance_code" value={me.acc_code ?? ""} />
              <input type="hidden" name="policy_lang" value="en" />
              <div className="flex gap-3">
                <Button type="submit">Yes</Button>
              </div>
            </form>
            <form action={acceptPolicyNoAction} className="mt-3">
              <Button type="submit" variant="outline">
                No
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
