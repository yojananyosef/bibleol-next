import Link from "next/link";
import { currentUserOrDummy, sessionLanguage } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { getSession } from "@/lib/auth/session";
import { getOAuth2Flow } from "@/lib/oauth2/cookie";
import { langText, langLine } from "@/lib/i18n/loader";
import { getIfLanguages } from "@/lib/services/translate";
import { getConfig } from "@/lib/config";
import { PolicyAccept } from "./policy-accept";
import { parsePolicyText } from "./policy-text";
import { NewOAuth2User } from "./new-oauth2-user";
import { LogoutButton } from "./logout-button";
import { LangSelect } from "@/components/i18n/lang-select";

export default async function Home() {
  const me = await currentUserOrDummy();
  const lang = await sessionLanguage();

  // Ctrl_main_page: ¿nuevo usuario OAuth2 sin aceptar política?
  if (users.isLoggedInNoAccept(me)) {
    users.generateAcceptanceCode(me);
    const flow = await getOAuth2Flow();
    if (flow?.newOauth2 && me.oauth2_login === flow.newOauth2) {
      const { text, lang: policyLang } = parsePolicyText(langLine(lang, "privacy", "privacy_text"));
      return (
        <NewOAuth2User
          me={me}
          policyText={text}
          policyLang={policyLang}
          l10n={{
            welcomeHead: langLine(lang, "login", `welcome_new_${flow.newOauth2}_user`),
            yourName: langLine(lang, "login", `your_${flow.newOauth2}_name`),
            yourNameNoEmail: langLine(lang, "login", `your_${flow.newOauth2}_name_no_email`),
            enjoy: langLine(lang, "login", "enjoy"),
            firstYouMustAccept: langLine(lang, "privacy", "first_you_must_accept_policy"),
            doYouAccept: langLine(lang, "privacy", "do_you_accept"),
            yes: langLine(lang, "common", "yes"),
            no: langLine(lang, "common", "no"),
          }}
        />
      );
    }
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
              {users.isTeacher(me) && (
                <Link href="/file_manager" className="text-primary underline-offset-4 hover:underline">
                  {langLine(lang, "menu", "manage_exercises")}
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
              {users.isTranslator(me) && (
                <Link href="/translate/lexicon" className="text-primary underline-offset-4 hover:underline">
                  {langLine(lang, "menu", "translate_lexicon")}
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
