import { PassageTree } from "@/components/quiz/PassageTree";
import { showQuizUniverse } from "@/lib/services/text-quiz";

export const dynamic = "force-dynamic";

interface UniversePageProps {
  searchParams: Promise<{ quiz?: string; count?: string }>;
}

export default async function UniversePage({ searchParams }: UniversePageProps) {
  const params = await searchParams;
  const quiz = params.quiz ?? "";
  const count = Math.max(1, Number(params.count ?? "10") || 10);

  const res = showQuizUniverse(quiz, "Everything");

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold">Select passage</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Mark the passages the quiz should use, then start.
        </p>
        <PassageTree
          quizPath={quiz}
          count={count}
          treeJson={res.tree_data}
          markedList={res.markedList}
          prop={res.prop}
        />
      </div>
    </main>
  );
}
