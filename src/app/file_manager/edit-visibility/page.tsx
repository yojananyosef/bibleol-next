import Link from "next/link";
import { checkTeacher } from "@/lib/auth/guards";
import { createQuizPath, getClassesForDir, updateClassesForDir } from "@/lib/services/quizpath";
import { getAllClasses } from "@/lib/services/classes";
import { redirect } from "next/navigation";
import type { ClassRow } from "@/lib/services/classes";

export const dynamic = "force-dynamic";

interface EditVisibilityPageProps {
  searchParams: Promise<{ dir?: string }>;
}

/** /file_manager/edit-visibility — Ctrl_file_manager::edit_visibility. */
export default async function EditVisibilityPage({ searchParams }: EditVisibilityPageProps) {
  await checkTeacher();
  const { dir } = await searchParams;

  let dirname: string;
  try {
    const qp = createQuizPath(false);
    qp.init(dir ?? "", true, false, []);
    if (qp.isTop()) throw new Error("You cannot change the visibility of the top folder");
    dirname = qp.getRelative();
  } catch (e) {
    return (
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-3xl">
          <h1 className="mb-4 text-xl font-semibold">Edit Visibility</h1>
          <p className="text-sm text-destructive">{e instanceof Error ? e.message : String(e)}</p>
        </div>
      </main>
    );
  }

  async function save(formData: FormData): Promise<void> {
    "use server";
    await checkTeacher();
    const qp = createQuizPath(false);
    qp.init(dirname, true, false, []);
    const oldClasses = getClassesForDir(qp.getRelative());
    const inclass = formData
      .getAll("inclass")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 0);
    updateClassesForDir(qp.getRelative(), oldClasses, inclass);
    redirect(`/file_manager?dir=${encodeURIComponent(dirname)}`);
  }

  const allClasses = getAllClasses();
  const oldClasses = getClassesForDir(dirname);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <h1 className="mb-4 text-xl font-semibold">{`Visibility of the folder '${dirname}'`}</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {`Here you can select which classes can see the exercises in the folder '${dirname}'. Students can check
        their performance for the contained exercises only if their class has been selected. This is also true
        for instructors. Instructors can only grade the contained exercises if they have selected the classes
        they teach.`}
      </p>

      <form action={save}>
        <p className="mb-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="inclass" value="0" defaultChecked={oldClasses.includes(0)} />
            Check here if folder is visible to everybody:
          </label>
          <span className="text-xs text-muted-foreground">
            (If not checked, only the classes indicated in the table below can see the exercises in this folder.)
          </span>
        </p>
        <p className="mb-3 mt-6 text-sm">In the table below, indicate which classes use this folder.</p>

        <div className="mb-3 overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left font-medium">Class</th>
                <th className="p-2 text-left font-medium">Class uses folder</th>
              </tr>
            </thead>
            <tbody>
              {allClasses.map((cl: ClassRow) => (
                <tr key={cl.clid} className="border-b">
                  <td className="p-2">{cl.classname}</td>
                  <td className="p-2 text-center">
                    <input type="checkbox" name="inclass" value={cl.clid} defaultChecked={oldClasses.includes(cl.clid)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="flex gap-2">
          <button type="submit" className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
            OK
          </button>
          <Link
            href={`/file_manager?dir=${encodeURIComponent(dirname)}`}
            className="rounded border px-4 py-2 text-sm hover:bg-muted/50"
          >
            Cancel
          </Link>
        </p>
      </form>
    </main>
  );
}