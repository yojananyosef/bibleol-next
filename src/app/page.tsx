import Link from "next/link";
import { currentUserOrDummy } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { sessionLanguage } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { langText, langLine } from "@/lib/i18n/loader";
import { getIfLanguages } from "@/lib/services/translate";
import { getConfig } from "@/lib/config";
import { PolicyAccept } from "./policy-accept";
import { LogoutButton } from "./logout-button";
import { LangSelect } from "@/components/i18n/lang-select";

export default async function Home() {
  const me = await currentUserOrDummy();
  const lang = await sessionLanguage();

  if (users.isLoggedInNoAccept(me)) {
    users.generateAcceptanceCode(me);
    return <PolicyAccept me={me} />;
  }

  const loggedIn = users.isLoggedIn(me);
  const session = await getSession();
  const variant = session?.variant ?? "";

  const langOptions = Object.entries(getIfLanguages()).map(([abb, native]) => ({ value: abb, label: native }));
  const variants = getConfig().variants || [];
  const fullName = users.makeFullName(me);
  const welcome = loggedIn
    ? langLine(lang, "intro_text", "welcome2").replace("%s", fullName)
    : langLine(lang, "intro_text", "welcome");
  const intro = langLine(lang, "intro_text", "intro_center");

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
                {fullName}
                {users.isTeacher(me) ? ` (${langLine(lang, "users", "teacher")})` : ""}
                {users.isAdmin(me) ? ` (${langLine(lang, "users", "administrator")})` : ""}
              </span>
              {users.isTeacher(me) && (
                <Link href="/admin/users" className="text-primary underline-offset-4 hover:underline">
                  {langLine(lang, "menu", "users")}
                </Link>
              )}
              {users.isAdmin(me) && (
                <Link href="/urls" className="text-primary underline-offset-4 hover:underline">
                  {langLine(lang, "menu", "manage_gloss_links")}
                </Link>
              )}
              {users.isTranslator(me) && (
                <Link href="/translate/if" className="text-primary underline-offset-4 hover:underline">
                  {langLine(lang, "menu", "translate_interface")}
                </Link>
              )}
              <Link href="/grades" className="text-primary underline-offset-4 hover:underline">
                {langLine(lang, "menu", "grades_my_quizzes")}
              </Link>
              <Link href="/stats" className="text-primary underline-offset-4 hover:underline">
                {langLine(lang, "menu", "my_progress")}
              </Link>
              <Link href="/profile" className="text-primary underline-offset-4 hover:underline">
                {langLine(lang, "menu", "profile")}
              </Link>
              <Link href="/settings/fonts" className="text-primary underline-offset-4 hover:underline">
                {langLine(lang, "menu", "font_preferences")}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                {langLine(lang, "menu", "login")}
              </Link>
              <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
                {langLine(lang, "login", "sign_up")}
              </Link>
            </>
          )}
          <LangSelect
            current={lang}
            variant={variant}
            variants={variants}
            options={langOptions}
            label={langText(lang, "language")}
            variantLabel={langText(lang, "variant")}
            mainVariantLabel={langText(lang, "main_variant")}
          />
        </nav>
      </header>
      <section className="mx-auto w-full max-w-3xl flex-1 p-8">
        <h1 className="mb-6 text-2xl font-semibold">{welcome}</h1>
        <div
          className="text-muted-foreground"
          // html permitido (intro_center trae <h1>/<p>/<a>)
          dangerouslySetInnerHTML={{ __html: intro }}
        />
      </section>
    </main>
  );
}
