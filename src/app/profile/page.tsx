import { currentUser } from "@/lib/auth/guards";
import { getAvailableLanguages, getAvailableVariants } from "@/lib/languages";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const me = await currentUser();
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
    />
  );
}
