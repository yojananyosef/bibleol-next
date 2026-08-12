import { checkTeacher } from "@/lib/auth/guards";
import { createQuizPath } from "@/lib/services/quizpath";
import { readFileSync } from "node:fs";

export const dynamic = "force-dynamic";

/**
 * GET /file_manager/download?dir=...&file=... — Ctrl_file_manager::download_ex
 * (application/octet-stream, Content-Disposition attachment con el nombre tal
 * cual, sin decodificar).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const dir = url.searchParams.get("dir");
  const file = url.searchParams.get("file");

  if (!dir)
    return new Response("Missing folder name", { status: 400, headers: { "Content-Type": "text/plain" } });
  if (!file)
    return new Response("Missing quiz filename", { status: 400, headers: { "Content-Type": "text/plain" } });

  try {
    await checkTeacher();
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let qp;
  try {
    qp = createQuizPath(false);
    qp.init(`${dir}/${file}`, false, false, []);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let contents: Buffer;
  try {
    contents = readFileSync(qp.getAbsolute());
  } catch {
    return new Response("Cannot open file", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  return new Response(new Uint8Array(contents), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(contents.length),
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}