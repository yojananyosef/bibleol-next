import { QuizPathBrowser } from "@/components/quiz/QuizPathBrowser";
import { createQuizPath } from "@/lib/services/quizpath";
import { dbAndBooks } from "@/lib/corpus/emdros";
import { checkTeacher } from "@/lib/auth/guards";
import { isTeacher, isAdmin } from "@/lib/services/users";

export const dynamic = "force-dynamic";

interface SelectQuizPageProps {
  searchParams: Promise<{ path?: string }>;
}

export default async function SelectQuizPage({ searchParams }: SelectQuizPageProps) {
  const params = await searchParams;
  const qp = createQuizPath(false);
  qp.init(params.path ?? "", true, false, []);

  const me = await checkTeacher();
  const teacher = isTeacher(me) || isAdmin(me);
  const defaultDb = dbAndBooks("en")[0]?.name;

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-3xl">
        <h1 className="mb-4 text-xl font-semibold">Select exercise</h1>
        <QuizPathBrowser root={qp.getRelative()} defaultDb={defaultDb} teacher={teacher} />
      </div>
    </main>
  );
}