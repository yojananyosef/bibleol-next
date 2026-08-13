import { sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { getAvailableLanguages, getAvailableVariants } from "@/lib/languages";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage() {
  const lang = await sessionLanguage();
  const t = (group: string, key: string) => langLine(lang, group, key);
  return (
    <SignUpForm
      languages={getAvailableLanguages(lang)}
      variants={getAvailableVariants()}
      l10n={{
        accountCreated: t("users", "you_created_account"),
        accountCreatedBody: t("users", "account_created_direct"),
        goToLogin: t("users", "go_to_home"),
        createAccount: t("users", "create_account"),
        userInformation: t("users", "specify_user_information"),
        username: t("users", "user_name"),
        email: t("users", "email"),
        password: t("users", "password"),
        repeatPassword: t("users", "repeat_password"),
        preferredLanguage: t("users", "preferred_language"),
        preferredVariant: t("users", "preferred_variant"),
        none: t("users", "no_language"),
        submit: t("users", "create_account"),
      }}
    />
  );
}
