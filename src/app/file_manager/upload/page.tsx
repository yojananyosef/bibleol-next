import { checkTeacher } from "@/lib/auth/guards";
import { createQuizPath } from "@/lib/services/quizpath";
import { Uploader } from "@/components/file-manager/uploader";

export const dynamic = "force-dynamic";

interface UploadPageProps {
  searchParams: Promise<{ dir?: string }>;
}

/** /file_manager/upload — Ctrl_file_manager::upload_files (port de view_upload_files). */
export default async function UploadPage({ searchParams }: UploadPageProps) {
  const { dir } = await searchParams;

  let dirname = "";
  try {
    await checkTeacher();
    const qp = createQuizPath(false);
    qp.init(dir ?? "", true, false, []);
    dirname = qp.getRelative();
  } catch (e) {
    return (
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-3xl">
          <h1 className="mb-4 text-xl font-semibold">Upload Files</h1>
          <p className="text-sm text-destructive">{e instanceof Error ? e.message : String(e)}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <h1 className="mb-4 text-xl font-semibold">Upload Exercise Files</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {dirname === ""
          ? "Here, you can upload the exercise template files to the top folder of this web site."
          : `Here, you can upload the exercise template files to the '${dirname}' folder of this web site.`}
        <br />
        Click the “Upload files” button to the right to select files to upload. (In some browsers, you can also drag
        and drop files into the button.)
      </p>
      <Uploader dir={dirname} />
      <p className="mt-6">
        <a href={`/file_manager?dir=${encodeURIComponent(dirname)}`} className="text-primary underline-offset-4 hover:underline">
          View folder
        </a>
      </p>
    </main>
  );
}