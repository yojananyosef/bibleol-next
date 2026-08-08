import Link from "next/link";
import { checkTeacher } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { parseUserListParams } from "@/lib/services/user-list";
import { getConfig } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteUserButton } from "./delete-user-button";

const ORDER_LABELS: Record<string, string> = {
  username: "User name",
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  isadmin: "Administrator",
  isteacher: "Teacher",
  istranslator: "Translator",
  last_login: "Last login",
};

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await checkTeacher();
  const sp = await searchParams;
  const p = parseUserListParams(sp);
  const cfg = getConfig();

  const filter = {
    username: String(sp.username ?? ""),
    first_name: String(sp.firstname ?? ""),
    last_name: String(sp.lastname ?? ""),
    email: String(sp.email ?? ""),
  };
  const hasFilter = Object.values(filter).some((v) => v !== "");

  const userCount = users.countUsers();
  const pageCount = Math.max(1, Math.ceil(userCount / cfg.users_per_page));
  const offset = Math.min(Math.max(p.offset, 0), pageCount - 1);

  const allusers = hasFilter
    ? users.filterUsers(filter)
    : users.getUsersPart(cfg.users_per_page, offset * cfg.users_per_page, p.orderby, p.sortorder);

  const arrow = (field: string) =>
    p.orderby === field ? (p.sortorder === "desc" ? " \u2193" : " \u2191") : "";
  const linkSort = (field: string) =>
    `/admin/users?offset=0&orderby=${field}&${p.orderby === field && p.sortorder === "asc" ? "desc" : "asc"}`;

  const fmtDate = (t: number) => new Date(t * 1000).toLocaleString();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            {userCount} user{userCount === 1 ? "" : "s"} — showing {cfg.users_per_page} per page
          </CardTitle>
          <Link href="/admin/users/edit?userid=-1">
            <Button size="sm">Add user</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <form action="/admin/users" method="get" className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="username" className="text-xs text-muted-foreground">Username</label>
              <Input id="username" name="username" defaultValue={filter.username} className="w-40" />
            </div>
            <div className="space-y-1">
              <label htmlFor="firstname" className="text-xs text-muted-foreground">First name</label>
              <Input id="firstname" name="firstname" defaultValue={filter.first_name} className="w-40" />
            </div>
            <div className="space-y-1">
              <label htmlFor="lastname" className="text-xs text-muted-foreground">Last name</label>
              <Input id="lastname" name="lastname" defaultValue={filter.last_name} className="w-40" />
            </div>
            <div className="space-y-1">
              <label htmlFor="email" className="text-xs text-muted-foreground">Email</label>
              <Input id="email" name="email" defaultValue={filter.email} className="w-44" />
            </div>
            <Button type="submit" size="sm">Search</Button>
            {hasFilter && (
              <Link href="/admin/users" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                Clear
              </Link>
            )}
          </form>

          <div className="mb-4 flex flex-wrap items-center gap-1">
            {Array.from({ length: pageCount }, (_, i) => i).map((pos) => (
              <Link
                key={pos}
                href={`/admin/users?offset=${pos}&orderby=${p.orderby}&${p.sortorder === "desc" ? "desc" : "asc"}`}
                className={`flex h-8 w-8 items-center justify-center rounded text-sm ${
                  pos === offset ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {pos + 1}
              </Link>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.entries(ORDER_LABELS).map(([field, label]) => (
                    <TableHead key={field}>
                      <Link href={linkSort(field)} className="whitespace-nowrap hover:underline">
                        {label}
                        {arrow(field)}
                      </Link>
                    </TableHead>
                  ))}
                  <TableHead>Operations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allusers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.first_name}</TableCell>
                    <TableCell>{u.last_name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.isadmin ? <Badge>Yes</Badge> : "No"}</TableCell>
                    <TableCell>{u.isteacher ? <Badge>Yes</Badge> : "No"}</TableCell>
                    <TableCell>{u.istranslator ? <Badge>Yes</Badge> : "No"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {u.last_login < u.created_time ? "never" : fmtDate(u.last_login)}
                    </TableCell>
                    <TableCell className="space-x-1 whitespace-nowrap">
                      <Link
                        href={`/admin/users/edit?userid=${u.id}&offset=${offset}&orderby=${p.orderby}&${p.sortorder}`}
                        className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
                      >
                        Edit
                      </Link>
                      {(me.id !== u.id && ((!u.isadmin && !u.isteacher) || me.isadmin)) && u.id !== null && (
                        <DeleteUserButton
                          userId={u.id}
                          username={u.username}
                          offset={offset}
                          orderby={p.orderby}
                          sortorder={p.sortorder}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {allusers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
