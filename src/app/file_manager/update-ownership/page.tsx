import { checkAdmin } from "@/lib/auth/guards";
import { fixExerciseowner } from "@/lib/services/quizpath";

export const dynamic = "force-dynamic";

/** /file_manager/update-ownership — Ctrl_file_manager::update_ownership (admin). */
export default async function UpdateOwnershipPage() {
  let added: string[];
  let deleted: string[];
  try {
    await checkAdmin();
    const res = fixExerciseowner();
    added = res.added;
    deleted = res.deleted;
  } catch (e) {
    return (
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-3xl">
          <h1 className="mb-4 text-xl font-semibold">Exercise ownership updated</h1>
          <p className="text-sm text-destructive">{e instanceof Error ? e.message : String(e)}</p>
        </div>
      </main>
    );
  }

  added.sort();
  deleted.sort();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <h1 className="mb-4 text-xl font-semibold">Exercise ownership updated</h1>

      <h2 className="mb-2 text-lg font-semibold">Ownership added for these exercises:</h2>
      {added.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="mb-4 list-disc pl-6 text-sm">
          {added.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 text-lg font-semibold">Ownership deleted for these exercises:</h2>
      {deleted.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="list-disc pl-6 text-sm">
          {deleted.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </main>
  );
}