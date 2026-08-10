import { Suspense } from "react";
import { checkTeacher } from "@/lib/auth/guards";
import { getQuizEditorDataAction } from "@/app/actions/quizeditor";
import { QuizEditor } from "@/components/quiz/editor/quiz-editor";

export const dynamic = "force-dynamic";

interface EditQuizPageProps {
  searchParams: Promise<{ quiz?: string; dir?: string; db?: string }>;
}

export default async function EditQuizPage({ searchParams }: EditQuizPageProps) {
  const params = await searchParams;
  const me = await checkTeacher();

  const res = await getQuizEditorDataAction({
    quiz: params.quiz ?? undefined,
    dir: params.dir ?? undefined,
    db: params.db ?? undefined,
  });

  if (!res.ok || !res.data) {
    return (
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-3xl">
          <h1 className="mb-4 text-xl font-semibold">Exercise editor</h1>
          <p className="text-sm text-destructive">{res.error ?? "Failed to load editor"}</p>
        </div>
      </main>
    );
  }

  const teacher = me.isteacher !== 0 || me.isadmin !== 0;

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-5xl">
        <Suspense fallback={<p className="py-10 text-sm text-muted-foreground">Loading…</p>}>
          <QuizEditor data={res.data} teacher={teacher} />
        </Suspense>
      </div>
    </main>
  );
}