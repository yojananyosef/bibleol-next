import { checkTeacher } from "@/lib/auth/guards";
import { createQuizPath } from "@/lib/services/quizpath";
import { writeFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export const maxDuration = 60;

/**
 * POST /api/upload?dir=...&qqfile=... — Ctrl_upload (valums qqUploadedFileXhr):
 * el fichero viaja en el cuerpo y el nombre en el query. Respuesta JSON 1:1
 * con handleUpload (nada de extensiones: en el legacy el array es vacío).
 */
export async function POST(request: Request): Promise<Response> {
  let myid = 0;
  try {
    const me = await checkTeacher();
    myid = me.id ?? 0;
  } catch {
    return json({ error: "No files were uploaded." });
  }

  const url = new URL(request.url);
  const uploadDir = url.searchParams.get("dir") ?? "";

  let qp;
  try {
    qp = createQuizPath(false);
    qp.init(uploadDir, true, false, []);
  } catch {
    return json({ error: "Server error. Upload directory isn't writable." });
  }

  let size = 0;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
    size = bytes.byteLength;
  } catch {
    return json({ error: "No files were uploaded." });
  }

  if (size === 0) return json({ error: "File is empty" });
  if (size > 10 * 1024 * 1024) return json({ error: "File is too large" });

  const qqfile = url.searchParams.get("qqfile") ?? "";
  const base = path.posix.basename(qqfile);
  const extIndex = base.lastIndexOf(".");
  const filename = extIndex === -1 ? base : base.slice(0, extIndex);
  const ext = extIndex === -1 ? "" : base.slice(extIndex + 1);

  let target = `${filename}.${ext}`;
  if (qp.fileExistsAt(target)) {
    let num = 0;
    do {
      ++num;
    } while (qp.fileExistsAt(`${filename}_${num}.${ext}`));
    target = `${filename}_${num}.${ext}`;
  }

  try {
    writeFileSync(qp.getAbsoluteFor(target), Buffer.from(bytes));
  } catch {
    return json({ error: "Could not save uploaded file.The upload was cancelled, or server error encountered" });
  }
  qp.setOwner(myid, NaN, target);

  return json({ success: true });
}

function json(data: { success?: boolean; error?: string }): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}