"use client";

/**
 * components/file-manager/file-manager.tsx — port de view_file_manager.php.
 * Diálogos y flujos 1:1: mkdir/rename/chown/delete/copy-move/create-exam/
 * create-exercise/insert-passages (con sessionStorage copy_passage_*).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createExamAction } from "@/app/actions/exams";
import {
  cancelCopyAction,
  copyDeleteFilesAction,
  createFolderAction,
  deleteFolderAction,
  insertFilesAction,
  passageInsertAction,
  renameFileAction,
} from "@/app/actions/file-manager";
import { composedir } from "@/lib/varset";
import type { DirList } from "@/lib/services/quizpath";
import type { DbBooks } from "@/lib/corpus/emdros";
import type { FmSessionData } from "@/lib/auth/fm-session";

export interface FileManagerData {
  dirlist: DirList;
  isTop: boolean;
  databases: DbBooks[];
  isadmin: boolean;
  teachers: Array<{ id: number; fullname: string }>;
  copyOrMove: FmSessionData | null;
  owners: Record<string, string>;
}

type Alert = { title: string; text: string };

const BAD_CHARS = /[/?*;'"{}\\]/;

function strip3et(name: string): string {
  return name.replace(/\.3et$/, "");
}

export function FileManager({ data }: { data: FileManagerData }) {
  const { dirlist } = data;
  const router = useRouter();

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [alert, setAlert] = useState<Alert | null>(null);
  const [busy, setBusy] = useState(false);

  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirError, setMkdirError] = useState<string | null>(null);
  const [mkdirName, setMkdirName] = useState("");

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameOld, setRenameOld] = useState("");
  const [renameNew, setRenameNew] = useState("");

  const [copyWarn, setCopyWarn] = useState<"copy" | "move" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [chownOpen, setChownOpen] = useState(false);
  const [chownError, setChownError] = useState<string | null>(null);
  const [chownUser, setChownUser] = useState("0");

  const [examOpen, setExamOpen] = useState(false);
  const [examName, setExamName] = useState("");

  const [newQuizOpen, setNewQuizOpen] = useState(false);
  const [newQuizDb, setNewQuizDb] = useState("");

  const [passageFile, setPassageFile] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("copy_passage_file");
  });
  const [passageDir, setPassageDir] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("copy_passage_dir");
  });
  const [passageOpen, setPassageOpen] = useState(false);
  const [folderDelete, setFolderDelete] = useState<string | null>(null);

  const fileNames = useMemo(() => dirlist.files.map((f) => f.filename), [dirlist]);

  function refresh(): void {
    router.refresh();
  }

  function run(fn: () => Promise<{ ok?: true; error?: string }>, done?: () => void): void {
    setBusy(true);
    void fn().then((res) => {
      setBusy(false);
      if (res.ok) {
        done?.();
        refresh();
      } else {
        setAlert({ title: "File Management", text: res.error ?? "Unknown error" });
      }
    });
  }

  function toggleAll(check: boolean): void {
    setChecked(new Set(check ? fileNames : []));
  }

  function toggleOne(name: string): void {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function clearPassageIfSource(name: string): void {
    if (passageDir === dirlist.relativedir && passageFile === name) {
      window.sessionStorage.removeItem("copy_passage_dir");
      window.sessionStorage.removeItem("copy_passage_file");
      setPassageFile(null);
      setPassageDir(null);
    }
  }

  function copyPassages(name: string): void {
    window.sessionStorage.setItem("copy_passage_dir", dirlist.relativedir);
    window.sessionStorage.setItem("copy_passage_file", strip3et(name));
    setPassageFile(strip3et(name));
    setPassageDir(dirlist.relativedir);
  }

  function submitCopyDelete(op: "copy" | "move" | "delete" | "chown" | "create_exam"): void {
    setCopyWarn(null);
    setDeleteConfirm(false);
    setChownOpen(false);
    setExamOpen(false);
    const files = Array.from(checked);
    if (op === "create_exam") {
      const fd = new FormData();
      fd.set("examname", examName);
      for (const f of files) fd.append("file", f);
      setBusy(true);
      void createExamAction(fd).then((res) => {
        setBusy(false);
        const id = res.ok && res.data ? (res.data as { id?: number }).id : undefined;
        if (typeof id === "number") {
          router.push(`/exams/${id}/edit`);
        } else {
          setAlert({ title: "Create Exam", text: (res as { error?: string }).error ?? "Unknown error" });
        }
      });
      return;
    }
    run(() =>
      copyDeleteFilesAction(dirlist.relativedir, files, op, chownUser).then((res) => {
        if (op === "move")
          for (const f of files) clearPassageIfSource(strip3et(f));
        return res;
      }),
    );
  }

  function createFolder(): void {
    const name = mkdirName.trim();
    if (name === "") {
      setMkdirError("Missing folder name");
      return;
    }
    if (BAD_CHARS.test(name)) {
      setMkdirError("Illegal character in folder name");
      return;
    }
    run(() => createFolderAction(dirlist.relativedir, name), () => setMkdirOpen(false));
  }

  function renameFile(): void {
    const name = renameNew.trim();
    if (name === "") {
      setRenameError("Missing filename");
      return;
    }
    if (BAD_CHARS.test(name)) {
      setRenameError("Illegal character in new filename");
      return;
    }
    run(() => renameFileAction(dirlist.relativedir, renameOld, name), () => {
      setRenameOpen(false);
      clearPassageIfSource(renameOld);
    });
  }

  function passageInsertConfirm(): void {
    setPassageOpen(false);
    const passageSource = `${window.sessionStorage.getItem("copy_passage_dir")}/${window.sessionStorage.getItem("copy_passage_file")}.3et`;
    const files = Array.from(checked);
    setBusy(true);
    void passageInsertAction({ dir: dirlist.relativedir, files, passageSource }).then((res) => {
      setBusy(false);
      if (res.status === "OK") {
        setAlert({ title: "File Management", text: "Passages successfully copied" });
      } else {
        setAlert({ title: "Passage copy error", text: res.error_text ?? "Unknown error" });
      }
    });
  }

  return (
    <div>
      {data.isTop ? (
        <h1 className="mb-3 text-xl font-semibold">This is the top folder</h1>
      ) : (
        <>
          <h1 className="mb-3 text-xl font-semibold">{`Folder: ${dirlist.relativedir.replace(/\/+$/, "")}`}</h1>
          <p className="mb-4">
            <Link
              href={`/file_manager/edit-visibility?dir=${encodeURIComponent(dirlist.relativedir)}`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Edit visibility
            </Link>
          </p>
        </>
      )}

      <p className="mb-4 text-sm text-muted-foreground">
        Here you can upload or delete exercise files, or you can create or delete folders for the files.
        <br />
        Note: You can only delete a folder if it is empty. The “Edit visibility” button allows you to control who
        can see the contents of each folder.
        <br />
        Finally, for creating a new exam, select the files you want the exam to contain.
      </p>

      {(dirlist.parentdir !== null || dirlist.directories.length > 0) && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Folders</h2>
          <table className="mb-3 w-full text-sm">
            <tbody>
              {dirlist.parentdir !== null && (
                <tr className="border-b">
                  <td className="py-1.5">
                    <span className="me-2">↑</span>
                    <Link href={`/file_manager?dir=${encodeURIComponent(dirlist.parentdir)}`} className="underline-offset-4 hover:underline">
                      Parent
                    </Link>
                  </td>
                  <td></td>
                </tr>
              )}
              {dirlist.directories.map(([dir]) => (
                <tr key={dir} className="border-b">
                  <td className="py-1.5">
                    <span className="me-2">📁</span>
                    <Link
                      href={`/file_manager?dir=${encodeURIComponent(composedir(dirlist.relativedir, dir))}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {dir}
                    </Link>
                  </td>
                  <td className="text-right">
                    {dirlist.is_empty[dir] ? (
                      <button
                        className="text-xs font-medium text-destructive underline-offset-4 hover:underline"
                        onClick={() => setFolderDelete(dir)}
                      >
                        Delete folder
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Folder is not empty</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="mb-4">
        <Button variant="outline" size="sm" onClick={() => setMkdirOpen(true)}>
          + Create folder
        </Button>
      </p>

      {dirlist.files.length > 0 && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Exercises</h2>
          <div className="mb-3 overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left font-medium">
                    Mark
                    <br />
                    <button onClick={() => toggleAll(false)} className="text-xs text-primary underline-offset-2 hover:underline">
                      Uncheck all
                    </button>{" "}
                    <button onClick={() => toggleAll(true)} className="text-xs text-primary underline-offset-2 hover:underline">
                      Check all
                    </button>
                  </th>
                  <th className="p-2 text-left font-medium">Name</th>
                  <th className="p-2 text-left font-medium">Owner</th>
                  <th className="p-2 text-left font-medium">Operations</th>
                </tr>
              </thead>
              <tbody>
                {dirlist.files.map((f) => (
                  <tr key={f.filename} className="border-b">
                    <td className="p-2">
                      <input type="checkbox" checked={checked.has(f.filename)} onChange={() => toggleOne(f.filename)} />
                    </td>
                    <td className="p-2">{strip3et(f.filename)}</td>
                    <td className="p-2">{data.owners[f.filename] ?? ""}</td>
                    <td className="p-2 text-xs">
                      <span className="me-2">
                        <a className="underline-offset-2 hover:underline" href={`/file_manager/download?dir=${encodeURIComponent(dirlist.relativedir)}&file=${encodeURIComponent(f.filename)}`}>
                          Download
                        </a>
                      </span>
                      <span className="me-2">
                        <a className="underline-offset-2 hover:underline" href={`/quiz/editor?quiz=${encodeURIComponent(`${dirlist.relativedir}/${f.filename}`)}`}>
                          Edit
                        </a>
                      </span>
                      <span className="me-2">
                        <button
                          className="underline-offset-2 hover:underline"
                          onClick={() => {
                            setRenameOld(strip3et(f.filename));
                            setRenameNew("");
                            setRenameError(null);
                            setRenameOpen(true);
                          }}
                        >
                          Rename
                        </button>
                      </span>
                      <span className="me-2">
                        <button
                          className={
                            passageDir === dirlist.relativedir && passageFile === strip3et(f.filename)
                              ? "font-semibold text-green-700 underline-offset-2"
                              : "underline-offset-2 hover:underline"
                          }
                          onClick={() => copyPassages(f.filename)}
                        >
                          Copy passages
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (checked.size === 0) {
                  setAlert({ title: "File selection", text: "No files selected" });
                  return;
                }
                setDeleteConfirm(true);
              }}
            >
              Delete marked files
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (checked.size === 0) {
                  setAlert({ title: "File selection", text: "No files selected" });
                  return;
                }
                setCopyWarn("copy");
              }}
            >
              Copy marked files
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (checked.size === 0) {
                  setAlert({ title: "File selection", text: "No files selected" });
                  return;
                }
                setCopyWarn("move");
              }}
            >
              Move marked files
            </Button>
            {data.isadmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (checked.size === 0) {
                    setAlert({ title: "File selection", text: "No files selected" });
                    return;
                  }
                  setChownError(null);
                  setChownUser("0");
                  setChownOpen(true);
                }}
              >
                Change owner of marked files
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (checked.size === 0) {
                  setAlert({ title: "File selection", text: "No files selected" });
                  return;
                }
                setExamName("");
                setExamOpen(true);
              }}
            >
              Create new exam from marked files
            </Button>
          </p>
        </>
      )}

      {data.copyOrMove && (
        <p className="mb-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBusy(true);
              void insertFilesAction(dirlist.relativedir).then((res) => {
                setBusy(false);
                if (res.ok) refresh();
                else setAlert({ title: "Insert Files", text: res.error ?? "Unknown error" });
              });
            }}
          >
            {data.copyOrMove.operation === "move" ? "Insert moved files" : "Insert copied files"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBusy(true);
              void cancelCopyAction().then(() => {
                setBusy(false);
                refresh();
              });
            }}
          >
            {data.copyOrMove.operation === "move" ? "Cancel move operation" : "Cancel copy operation"}
          </Button>
        </p>
      )}

      <p className="flex flex-wrap gap-2">
        <Link
          href={`/file_manager/upload?dir=${encodeURIComponent(dirlist.relativedir)}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Upload exercises
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const db = data.databases[0]?.name ?? "";
            setNewQuizDb(db);
            setNewQuizOpen(true);
          }}
        >
          Create exercise
        </Button>
        {passageFile !== null && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (checked.size === 0) {
                setAlert({ title: "File selection", text: "No files selected" });
                return;
              }
              setPassageOpen(true);
            }}
          >
            Insert passages into marked files
          </Button>
        )}
      </p>

      {/* Confirm deletion of folder dialog */}
      <AlertDialog open={folderDelete !== null} onOpenChange={(o) => !o && setFolderDelete(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder</AlertDialogTitle>
            <AlertDialogDescription>
              {folderDelete !== null ? `Do you want to delete the folder '${folderDelete}'?` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              disabled={busy}
              onClick={() => {
                const name = folderDelete;
                setFolderDelete(null);
                if (name !== null) run(() => deleteFolderAction(dirlist.relativedir, name));
              }}
            >
              Yes
            </Button>
            <Button variant="outline" onClick={() => setFolderDelete(null)}>
              No
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create folder dialog */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {mkdirError && <p className="text-sm text-destructive">{mkdirError}</p>}
            <div>
              <label htmlFor="mkdir-name" className="mb-1 block text-sm">
                Folder name:
              </label>
              <Input id="mkdir-name" value={mkdirName} onChange={(e) => setMkdirName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={createFolder}>
              OK
            </Button>
            <Button variant="outline" onClick={() => setMkdirOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
            <div>
              <label htmlFor="rename-newname" className="mb-1 block text-sm">
                New filename:
              </label>
              <Input id="rename-newname" value={renameNew} onChange={(e) => setRenameNew(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={renameFile}>
              OK
            </Button>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy/move warning dialog */}
      <AlertDialog open={copyWarn !== null} onOpenChange={(o) => !o && setCopyWarn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copyWarn === "move" ? "Move Files" : "Copy Files"}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Click “OK” here, and then go to the destination folder and press “${
                copyWarn === "move" ? "Insert moved files" : "Insert copied files"
              }”.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              disabled={busy}
              onClick={() => submitCopyDelete(copyWarn === "move" ? "move" : "copy")}
            >
              OK
            </Button>
            <Button variant="outline" onClick={() => setCopyWarn(null)}>
              Cancel
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>Do you want to delete the indicated files?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button disabled={busy} onClick={() => submitCopyDelete("delete")}>
              Yes
            </Button>
            <Button variant="outline" onClick={() => setDeleteConfirm(false)}>
              No
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change owner dialog */}
      <Dialog open={chownOpen} onOpenChange={setChownOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Owner</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {chownError && <p className="text-sm text-destructive">{chownError}</p>}
            <div>
              <label htmlFor="chown-selector" className="mb-1 block text-sm">
                New owner:
              </label>
              <select
                id="chown-selector"
                className="w-full rounded border px-2 py-1 text-sm"
                value={chownUser}
                onChange={(e) => setChownUser(e.target.value)}
              >
                <option value="0" />
                {data.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullname}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => {
                if (chownUser === "0") {
                  setChownError("No user selected");
                  return;
                }
                submitCopyDelete("chown");
              }}
            >
              OK
            </Button>
            <Button variant="outline" onClick={() => setChownOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create exam dialog */}
      <Dialog open={examOpen} onOpenChange={setExamOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Exam</DialogTitle>
            <DialogDescription>
              At this time, the “Fixed number of questions” for each exercise used in an exam must be set to 0 in
              order for the exam duration to be enforced properly.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="exam_name" className="mb-1 block text-sm">
              Exam Name:
            </label>
            <Input id="exam_name" value={examName} onChange={(e) => setExamName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={() => submitCopyDelete("create_exam")}>
              Create Exam
            </Button>
            <Button variant="outline" onClick={() => setExamOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create exercise dialog */}
      <Dialog open={newQuizOpen} onOpenChange={setNewQuizOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Exercise</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Select database:</h4>
            {data.databases.map((db) => (
              <label key={db.name} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="db"
                  value={db.name}
                  checked={newQuizDb === db.name}
                  onChange={() => setNewQuizDb(db.name)}
                />
                {db.loc_desc}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => {
                setNewQuizOpen(false);
                router.push(`/quiz/editor?dir=${encodeURIComponent(dirlist.relativedir)}&db=${encodeURIComponent(newQuizDb)}`);
              }}
            >
              OK
            </Button>
            <Button variant="outline" onClick={() => setNewQuizOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passage insert confirmation dialog */}
      <AlertDialog open={passageOpen} onOpenChange={setPassageOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm passage insertion</AlertDialogTitle>
            <AlertDialogDescription data-fm-passage-source>
              {`Overwrite marked files with passages from file '${
                passageFile !== null && passageDir !== null ? `${passageDir}/${passageFile}` : ""
              }'?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button disabled={busy} onClick={passageInsertConfirm}>
              Yes
            </Button>
            <Button variant="outline" onClick={() => setPassageOpen(false)}>
              No
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert dialog (myalert / myalert_large) */}
      <AlertDialog open={alert !== null} onOpenChange={(o) => !o && setAlert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alert?.title}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">{alert?.text}</AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}