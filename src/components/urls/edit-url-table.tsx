"use client";

/**
 * edit-url-table.tsx — Port de view_edit_url.php (Ctrl_urls::edit_url):
 * tabla de lexemas con sus URLs y diálogos de crear/editar/borrar enlaces.
 */

import { useActionState, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Book, FileText, Film, Globe, ImageIcon, Library, Link, Music, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { changeUrlAction, deleteUrlAction, type UrlsResult } from "@/app/actions/urls";
import { ICON_NAMES } from "@/lib/services/icons";
import type { LexemeRow } from "@/lib/services/urls";
import "./urls.css";

const ICON_GLYPH: Record<string, React.ReactNode> = {
  "l-icon-link": <Link className="h-4 w-4" />,
  "l-icon-file": <FileText className="h-4 w-4" />,
  "l-icon-music": <Music className="h-4 w-4" />,
  "l-icon-picture": <ImageIcon className="h-4 w-4" />,
  "l-icon-film": <Film className="h-4 w-4" />,
  "l-icon-speaker": <Volume2 className="h-4 w-4" />,
  "l-icon-book": <Book className="h-4 w-4" />,
  "l-icon-globe": <Globe className="h-4 w-4" />,
  "l-icon-logos": <Library className="h-4 w-4" />,
};

const ICON_LABELS: Record<string, string> = {
  "l-icon-link": "Link",
  "l-icon-file": "File",
  "l-icon-music": "Music",
  "l-icon-speaker": "Sound",
  "l-icon-picture": "Picture",
  "l-icon-film": "Film",
  "l-icon-book": "Book",
  "l-icon-globe": "Map",
  "l-icon-logos": "Logos",
};

const URL_REGEX =
  /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})).?)(?::\d{2,5})?(?:[/?#]\S*)?$/i;

interface EditState {
  mode: "create" | "edit";
  id: number;
  lex: string;
  gloss: string;
  url: string;
  icon: string;
}

export function EditUrlTable({ words, longlang }: { words: LexemeRow[]; longlang: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestUri = `${pathname}${searchParams.size > 0 ? "?" + searchParams.toString() : ""}`;

  const [, changeFormAction] = useActionState<UrlsResult | null, FormData>(changeUrlAction, null);
  const [, deleteFormAction] = useActionState<UrlsResult | null, FormData>(deleteUrlAction, null);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleteId, setDeleteId] = useState<{ id: number; text: string } | null>(null);
  const [error, setError] = useState("");

  // scrolltop: se restaura al cargar si el query lo trae (legacy $_GET['scrolltop'])
  useEffect(() => {
    const st = Number(searchParams.get("scrolltop"));
    if (Number.isFinite(st) && st > 0) window.scrollTo(0, st);
  }, [searchParams]);

  const scrollTop = () => window.scrollY | 0;

  const openCreate = (w: LexemeRow) => {
    setError("");
    setEdit({
      mode: "create", id: -1, lex: w.lex,
      gloss: `<span class="heb-default rtl">${w.vocalized_lexeme_utf8} ${w.roman}</span>`,
      url: "", icon: "l-icon-link",
    });
  };

  const openEdit = (w: LexemeRow, url: { id: number; url: string; icon: string }) => {
    setError("");
    setEdit({
      mode: "edit", id: url.id, lex: w.lex,
      gloss: `<span class="heb-default rtl">${w.vocalized_lexeme_utf8} ${w.roman}</span>`,
      url: url.url, icon: url.icon,
    });
  };

  const submit = () => {
    if (!edit) return;
    const f = document.getElementById("edit-url-form") as HTMLFormElement;
    if (!f) return;
    (f.elements.namedItem("id") as HTMLInputElement).value = String(edit.id);
    (f.elements.namedItem("lex") as HTMLInputElement).value = edit.lex;
    (f.elements.namedItem("longlang") as HTMLInputElement).value = longlang;
    (f.elements.namedItem("link") as HTMLInputElement).value = edit.url;
    (f.elements.namedItem("icon") as HTMLInputElement).value = edit.icon;
    (f.elements.namedItem("scrolltop") as HTMLInputElement).value = String(scrollTop());
    (f.elements.namedItem("requesturi") as HTMLInputElement).value = requestUri;
    f.submit();
  };

  const okClick = () => {
    if (!edit) return;
    const linkname = edit.url.trim();
    if (linkname === "") setError("missing_link");
    else if (!URL_REGEX.test(linkname)) setError("invalid_link");
    else submit();
  };

  const deleteSubmit = () => {
    if (!deleteId) return;
    const f = document.getElementById("delete-url-form") as HTMLFormElement;
    if (!f) return;
    (f.elements.namedItem("urlid") as HTMLInputElement).value = String(deleteId.id);
    (f.elements.namedItem("scrolltop") as HTMLInputElement).value = String(scrollTop());
    (f.elements.namedItem("requesturi") as HTMLInputElement).value = requestUri;
    f.submit();
  };

  const makeAdd = (w: LexemeRow, urlCount: number) => urlCount >= 3 ? null : (
    <a
      className="badge badge-primary"
      href="#"
      onClick={(e) => { e.preventDefault(); openCreate(w); }}
    >
      Add link
    </a>
  );

  return (
    <>
      <table className="table table-striped">
        <thead>
          <tr>
            <th className="text-right">Lexeme</th>
            <th>English</th>
            <th>Icon</th>
            <th>Link</th>
            <th>Operations</th>
          </tr>
        </thead>
        <tbody>
          {words.map((w, ix) => {
            const urls = w.urls ?? [];
            const cells: React.ReactNode[] = [];
            for (let i = 0; i < 3; ++i) {
              if (urls[i]) {
                const u = urls[i];
                cells.push(
                  <span key={i}>
                    <span className={`${u.icon in ICON_GLYPH ? "" : "hidden"}`}>
                      {ICON_GLYPH[u.icon] ?? null}
                    </span>
                    <br />
                  </span>,
                );
              }
            }
            const links: React.ReactNode[] = [];
            for (let i = 0; i < 3; ++i) {
              if (urls[i]) {
                links.push(
                  <span key={i}>
                    <a href={urls[i].url} target="_blank" rel="noopener noreferrer">Link</a>
                    <br />
                  </span>,
                );
              }
            }
            const ops: React.ReactNode[] = [];
            let makeAddHere = !(urls.length > 0);
            for (let i = 0; i < 3; ++i) {
              if (urls[i]) {
                const u = urls[i];
                ops.push(
                  <span key={i}>
                    <a
                      className="badge badge-primary"
                      href="#"
                      onClick={(e) => { e.preventDefault(); openEdit(w, u); }}
                    >
                      Edit
                    </a>{" "}
                    <a
                      className="badge badge-danger"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteId({
                          id: u.id,
                          text: `${w.vocalized_lexeme_utf8} ${w.roman}`,
                        });
                      }}
                    >
                      Delete
                    </a>
                    <br />
                  </span>,
                );
              } else {
                makeAddHere = true;
              }
            }
            if (makeAddHere) ops.push(<span key="add">{makeAdd(w, urls.length)}</span>);

            return (
              <tr key={ix}>
                <td className="heb-default rtl">{w.vocalized_lexeme_utf8} {w.roman}</td>
                <td>{w.gloss}</td>
                <td>{cells}</td>
                <td>{links}</td>
                <td>{ops}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle
                dangerouslySetInnerHTML={{
                  __html: edit.mode === "create"
                    ? `Create Link for Lexeme ${edit.gloss}`
                    : `Edit Link for Lexeme ${edit.gloss}`,
                }}
              />
            </DialogHeader>
            {error && <p className="text-sm text-red-600">{error === "missing_link" ? "No link provided" : "Invalid link provided"}</p>}
            <label className="text-sm">Link:</label>
            <Input
              value={edit.url}
              onChange={(e) => setEdit({ ...edit, url: e.target.value })}
            />
            <label className="text-sm">Icon:</label>
            <div className="iconlist grid grid-cols-3 gap-2">
              {ICON_NAMES.map((name) => (
                <label key={name} className="flex cursor-pointer items-center gap-1">
                  {ICON_GLYPH[name]}
                  <input
                    type="radio"
                    name="icon"
                    value={name}
                    checked={edit.icon === name}
                    onChange={() => setEdit({ ...edit, icon: name })}
                  />
                  {ICON_LABELS[name]}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={okClick}>OK</Button>
              <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete link</AlertDialogTitle>
            <AlertDialogDescription
              dangerouslySetInnerHTML={{
                __html: deleteId
                  ? `Delete link from gloss <span class="heb-default rtl">${deleteId.text}</span>`
                  : "",
              }}
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={deleteSubmit}>Yes</AlertDialogAction>
            <AlertDialogCancel>No</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <form id="edit-url-form" action={changeFormAction} method="post" className="hidden">
        <input type="hidden" name="id" />
        <input type="hidden" name="lex" />
        <input type="hidden" name="longlang" />
        <input type="hidden" name="link" />
        <input type="hidden" name="icon" />
        <input type="hidden" name="scrolltop" />
        <input type="hidden" name="requesturi" />
      </form>
      <form id="delete-url-form" action={deleteFormAction} method="post" className="hidden">
        <input type="hidden" name="urlid" />
        <input type="hidden" name="scrolltop" />
        <input type="hidden" name="requesturi" />
      </form>
    </>
  );
}