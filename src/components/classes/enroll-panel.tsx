"use client";

// /enroll — Ctrl_userclass::enroll + enroll_in + manage_access + unenroll_from
// (1:1 view_enroll_in_class / view_enroll_form / view_enrolled).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { enrollInAction, getEnrollDataAction, manageAccessAction, unenrollAction } from "@/app/actions/classes";
import type { ClsResult } from "@/app/actions/classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type EnrollPayload = {
  allClasses: Array<{ id: number; clid: number; classname: string; clpass: string | null; enrol_before: string | null; priority: number }>;
  oldClasses: Record<number, number>;
  availClasses: number[];
};

export function EnrollPanel() {
  const router = useRouter();
  const [data, setData] = useState<EnrollPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pwClass, setPwClass] = useState<number | null>(null);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<string | null>(null);

  useEffect(() => {
    getEnrollDataAction().then((res: ClsResult) => {
      if (res.ok && res.data) setData(res.data as EnrollPayload);
      else setError(res.error ?? "unknown error");
    });
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const byId = (id: number) => data.allClasses.find((c) => c.clid === id);
  const enrolledIds = Object.keys(data.oldClasses).map(Number);

  const reload = async () => {
    const fresh = await getEnrollDataAction();
    if (fresh.ok && fresh.data) {
      setData(fresh.data as EnrollPayload);
      router.refresh();
    }
  };

  const doEnroll = async (classid: number) => {
    const fd = new FormData();
    fd.set("classid", String(classid));
    fd.set("password", pw);
    const res = await enrollInAction(fd);
    if (res.ok) {
      setEnrolled((res.data as { classname: string })?.classname ?? "");
      setPwClass(null);
      setPw("");
      await reload();
    } else {
      setPwError(res.error ?? "unknown error");
    }
  };

  const doAction = async (action: typeof unenrollAction, classid: number) => {
    const fd = new FormData();
    fd.set("classid", String(classid));
    if (action === manageAccessAction) fd.set("grant", "1");
    const res = await action(fd);
    if (res.ok) await reload();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>You can enroll in</CardTitle>
        </CardHeader>
        <CardContent>
          {data.availClasses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes available for enrollment.</p>
          ) : (
            <ul className="space-y-2">
              {data.availClasses.map((clid) => {
                const cl = byId(clid);
                if (!cl) return null;
                return (
                  <li key={clid} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>{cl.classname}</span>
                    {cl.clpass ? (
                      <Button size="sm" variant="outline" onClick={() => { setPwClass(clid); setPw(""); setPwError(null); }}>
                        Enroll (password)
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => doEnroll(clid)}>
                        Enroll
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>You are enrolled in</CardTitle>
        </CardHeader>
        <CardContent>
          {enrolledIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">You are not enrolled in any class.</p>
          ) : (
            <ul className="space-y-2">
              {enrolledIds.map((clid) => {
                const cl = byId(clid);
                const access = data.oldClasses[clid];
                if (!cl) return null;
                return (
                  <li key={clid} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>{cl.classname}</span>
                    <span className="flex items-center gap-2">
                      {access ? (
                        <>
                          <span className="text-xs text-muted-foreground">Teacher can access</span>
                          <Badge className="cursor-pointer" onClick={() => doAction(manageAccessAction, clid)}>Revoke access</Badge>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground">Teacher cannot access</span>
                          <Badge className="cursor-pointer" onClick={() => doAction(manageAccessAction, clid)}>Grant access</Badge>
                        </>
                      )}
                      <Badge className="cursor-pointer" onClick={() => doAction(unenrollAction, clid)}>Unenroll</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={pwClass !== null} onOpenChange={(o) => { if (!o) setPwClass(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enter class password</AlertDialogTitle>
            <AlertDialogDescription>
              This class is protected. Ask your teacher for the password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
          {pwError && <p className="text-sm text-destructive">{pwError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPwClass(null)}>Cancel</Button>
            <Button onClick={() => pwClass !== null && doEnroll(pwClass)}>Enroll</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={enrolled !== null} onOpenChange={(o) => { if (!o) setEnrolled(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enrolled</AlertDialogTitle>
            <AlertDialogDescription>
              You are now enrolled in the class &ldquo;{enrolled}&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => { setEnrolled(null); router.refresh(); }}>OK</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}