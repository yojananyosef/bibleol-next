import { checkTeacher } from "@/lib/auth/guards";
import { getFileManagerDataAction } from "@/app/actions/file-manager";
import { FileManager, type FileManagerData } from "@/components/file-manager/file-manager";

export const dynamic = "force-dynamic";

interface FileManagerPageProps {
  searchParams: Promise<{ dir?: string }>;
}

/** /file_manager — Ctrl_file_manager::show_files (gestión de ejercicios). */
export default async function FileManagerPage({ searchParams }: FileManagerPageProps) {
  const { dir } = await searchParams;

  const res = await getFileManagerDataAction(dir ?? "");
  if (!res.ok || !res.data) {
    return (
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-3xl">
          <h1 className="mb-4 text-xl font-semibold">File Management</h1>
          <p className="text-sm text-destructive">{res.error ?? "Failed to load file manager"}</p>
        </div>
      </main>
    );
  }

  await checkTeacher();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <FileManager data={res.data as FileManagerData} />
    </main>
  );
}