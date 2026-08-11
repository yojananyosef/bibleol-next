import { sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { getConfig } from "@/lib/config";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const lang = await sessionLanguage();
  const cfg = getConfig();
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
        google: t("login", "sign_in_google"),
        facebook: t("login", "sign_in_facebook"),
      }}
      googleEnabled={cfg.google_login_enabled}
      facebookEnabled={cfg.facebook_login_enabled}
    />
  );
}