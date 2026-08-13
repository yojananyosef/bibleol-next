import { currentUser, sessionLanguage } from "@/lib/auth/guards";
import { langLine } from "@/lib/i18n/loader";
import { getAvailableLanguages, getAvailableVariants } from "@/lib/languages";
import { ProfileForm } from "./profile-form";
import { OAuth2Profile } from "./oauth2-profile";

export default async function ProfilePage() {
  const me = await currentUser();
  const lang = await sessionLanguage();
  const t = (group: string, key: string) => langLine(lang, group, key);

  // Ctrl_users::profile — rama OAuth2 (view_oauth2_profile)
  if (me.oauth2_login) {
    const authority = me.oauth2_login === "facebook" ? "facebook" : "google";
    return (
      <OAuth2Profile
        user={{
          first_name: me.first_name,
          last_name: me.last_name,
          family_name_first: !!me.family_name_first,
          email: me.email ?? "",
          preflang: me.preflang,
          prefvariant: me.prefvariant,
          oauth2_login: me.oauth2_login,
        }}
        languages={getAvailableLanguages(lang)}
        variants={getAvailableVariants()}
        l10n={{
          youLogin: t("users", `you_login_${authority}`),
          first: t("users", "first_name"),
          last: t("users", "last_name"),
          familyNameFirst: t("users", "chinese_name_order"),
          yes: t("common", "yes"),
          no: t("common", "no"),
          email: t("users", "email"),
          preferredLanguage: t("users", "preferred_language"),
          noLanguage: t("users", "no_language"),
          preferredVariant: t("users", "preferred_variant"),
          save: t("common", "OK_button"),
          cancel: t("common", "cancel_button"),
          changeThrough: t("users", `change_through_${authority}`),
          deleteConfirm: t("users", "delete_oauth2_profile1"),
          deleteNote: t("users", `delete_${authority}_profile2`),
          deleteProfile: t("users", "delete_profile_button"),
        }}
      />
    );
  }

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
      languages={getAvailableLanguages(lang)}
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