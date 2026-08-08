export interface UserListParams {
  offset: number;
  orderby: string;
  sortorder: "asc" | "desc";
}

/** Parsea searchParams del listado de usuarios (paridad con Ctrl_users). */
export function parseUserListParams(sp: { [k: string]: string | string[] | undefined }): UserListParams {
  const offset = Math.max(0, parseInt(String(sp.offset ?? "0"), 10) || 0);
  const orderby = String(sp.orderby ?? "username");
  const sortorder: "asc" | "desc" = sp.desc !== undefined && String(sp.desc) !== "" ? "desc" : "asc";
  return { offset, orderby, sortorder };
}
