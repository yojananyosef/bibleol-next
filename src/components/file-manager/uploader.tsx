"use client";

/**
 * components/file-manager/uploader.tsx — port del cliente valums
 * (qq.FileUploader): botón + zona de drop + lista de resultados, subiendo
 * cada fichero por XHR a /api/upload?dir=...&qqfile=... (cuerpo = fichero).
 */

import { useRef, useState } from "react";

type UploadResult = { name: string; status: "ok" | "error"; text: string };

const ALLOWED_EXTENSIONS = ["3et"];

export function Uploader({ dir }: { dir: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  function uploadFiles(files: FileList | File[]): void {
    setBusy(true);
    const list = Array.from(files);
    const next: UploadResult[] = [];
    let pending = list.length;
    if (pending === 0) {
      setBusy(false);
      return;
    }
    for (const file of list) {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase() : "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        next.push({ name: file.name, status: "error", text: "File has an invalid extension, it should be one of 3et." });
        pending--;
        if (pending === 0) setResults((prev) => [...prev, ...next]);
        continue;
      }
      fetch(`/api/upload?dir=${encodeURIComponent(dir)}&qqfile=${encodeURIComponent(file.name)}`, {
        method: "POST",
        body: file,
      })
        .then((res) => res.json() as Promise<{ success?: boolean; error?: string }>)
        .then((data) => {
          if (data.success) next.push({ name: file.name, status: "ok", text: "Uploaded" });
          else next.push({ name: file.name, status: "error", text: data.error ?? "Unknown error" });
        })
        .catch(() => {
          next.push({ name: file.name, status: "error", text: "Network error" });
        })
        .finally(() => {
          pending--;
          if (pending === 0) {
            setResults((prev) => [...prev, ...next]);
            setBusy(false);
          }
        });
    }
  }

  return (
    <div>
      <div
        className={`flex flex-col items-center gap-3 rounded border-2 border-dashed p-8 ${
          dragging ? "border-primary bg-muted/40" : "border-muted"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          uploadFiles(e.dataTransfer.files);
        }}
      >
        <span className="text-sm text-muted-foreground">Drop files here to upload</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground enabled:hover:bg-primary/90 disabled:opacity-50"
        >
          Upload files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".3et"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {busy && <p className="mt-3 text-sm text-muted-foreground">Uploading…</p>}

      {results.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {results.map((r, ix) => (
            <li key={`${r.name}-${ix}`} className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">{r.name}</span>
              <span className={r.status === "ok" ? "text-green-700" : "text-destructive"}>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}