import { currentUser, sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { getAvailableLanguages, getAvailableVariants } from "@/lib/languages";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const me = await currentUser();
  const lang = await sessionLanguage();
  const t = (group: string, key: string) => langLine(lang, group, key);
  return (
    <ProfileForm
      user={{
        first_name: me.first_name,
        last_name: me.last_name,
        family_name_first: !!me.family_name_first,
        email: me.email ?? "",
        preflang: me.preflang,
        prefvariant: me.prefvariant,
        oauth2_login: me.oauth2_login,
      }}
      languages={getAvailableLanguages()}
      variants={getAvailableVariants()}
      l10n={{
        title: t("users", "edit_user_profile"),
        firstName: t("users", "first_name"),
        lastName: t("users", "last_name"),
        familyNameFirst: t("users", "chinese_name_order"),
        email: t("users", "email"),
        preferredLanguage: t("users", "preferred_language"),
        preferredVariant: t("users", "preferred_variant"),
        none: t("users", "no_language"),
        newPassword: t("users", "new_password"),
        repeatNewPassword: t("users", "repeat_new_password"),
        leaveBlank: t("users", "leave_blank_pw"),
        save: t("common", "OK_button"),
        deleteProfile: t("users", "delete_profile_button"),
      }}
    />
  );
}
