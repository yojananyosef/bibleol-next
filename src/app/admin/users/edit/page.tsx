import { checkTeacher } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { getAvailableLanguages, getAvailableVariants } from "@/lib/languages";
import { parseUserListParams } from "@/lib/services/user-list";
import { EditUserForm } from "./edit-user-form";

export default async function AdminEditUserPage({ searchParams }: PageProps<"/admin/users/edit">) {
  const me = await checkTeacher();
  const sp = await searchParams;
  const p = parseUserListParams(sp);
  const userid = parseInt(String(sp.userid ?? "0"), 10) || 0;
  const u = users.getUserById(userid);

  return (
    <EditUserForm
      me={{
        isadmin: users.isAdmin(me),
        isteacher: users.isTeacher(me),
        istranslator: users.isTranslator(me),
      }}
      user={{
        id: u.id,
        isNew: u.id === null,
        username: u.username,
        first_name: u.first_name,
        last_name: u.last_name,
        family_name_first: !!u.family_name_first,
        email: u.email ?? "",
        preflang: u.preflang,
        prefvariant: u.prefvariant,
        isadmin: !!u.isadmin,
        isteacher: !!u.isteacher,
        istranslator: !!u.istranslator,
        oauth2_login: u.oauth2_login,
      }}
      extras={{ offset: p.offset, orderby: p.orderby, sortorder: p.sortorder }}
      languages={getAvailableLanguages()}
      variants={getAvailableVariants()}
    />
  );
}
