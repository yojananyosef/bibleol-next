import Link from "next/link";
import { currentUserOrDummy } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { PolicyAccept } from "./policy-accept";
import { LogoutButton } from "./logout-button";

export default async function Home() {
  const me = await currentUserOrDummy();

  if (users.isLoggedInNoAccept(me)) {
    users.generateAcceptanceCode(me);
    return <PolicyAccept me={me} />;
  }

  const loggedIn = users.isLoggedIn(me);
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="text-lg font-semibold">
          Bible Online Learner
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {loggedIn ? (
            <>
              <span className="text-muted-foreground">
                {users.makeFullName(me)}
                {users.isTeacher(me) ? " (teacher)" : ""}
                {users.isAdmin(me) ? " (admin)" : ""}
              </span>
              {users.isTeacher(me) && (
                <Link href="/admin/users" className="text-primary underline-offset-4 hover:underline">
                  Users
                </Link>
              )}
              <Link href="/profile" className="text-primary underline-offset-4 hover:underline">
                Profile
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                Log in
              </Link>
              <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>
      <section className="mx-auto w-full max-w-3xl flex-1 p-8">
        <h1 className="mb-2 text-2xl font-semibold">
          {loggedIn ? `Welcome, ${users.makeFullName(me)}` : "Bible Online Learner"}
        </h1>
        <p className="text-muted-foreground">
          Learn the original languages of the Bible with the help of quizzes and annotated texts.
          (Fase 2 — auth; el lector de texto y los quizzes llegan en Fases 4-5.)
        </p>
      </section>
    </main>
  );
}
