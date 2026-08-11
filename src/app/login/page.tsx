import { sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const lang = await sessionLanguage();
  const t = (group: string, key: string) => langLine(lang, group, key);
  return (
    <LoginForm
      l10n={{
        title: t("login", "please_log_in"),
        subtitle: "Bible Online Learner",
        username: t("login", "user_name"),
        password: t("login", "password"),
        submit: t("login", "login_button"),
        forgot: t("login", "forgot_name_or_password"),
        create: t("login", "sign_up"),
      }}
    />
  );
}
