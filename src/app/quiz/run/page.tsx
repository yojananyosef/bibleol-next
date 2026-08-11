import { Suspense } from "react";
import { showQuiz, type ShowQuizPayload } from "@/lib/services/text-quiz";
import { currentUserOrDummy } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { QuizRunner } from "@/components/quiz/QuizRunner";

export const dynamic = "force-dynamic";

interface RunQuizPageProps {
  searchParams: Promise<{
    quiz?: string;
    count?: string;
    examid?: string;
    exercise_lst?: string;
    selection?: string;
  }>;
}

export default async function RunQuizPage({ searchParams }: RunQuizPageProps) {
  const params = await searchParams;
  const quiz = params.quiz ?? "";
  const count = Math.max(1, Number(params.count ?? "10") || 10);
  const examid = params.examid ? Number(params.examid) : undefined;
  const exerciseLst = params.exercise_lst;
  const selection = params.selection
    ? params.selection.split(",").filter((s) => s.length > 0)
    : null;

  const me = await currentUserOrDummy();
  const loggedIn = users.isLoggedIn(me);
  const payload: ShowQuizPayload = showQuiz(quiz, count, selection, {
    userid: me.id ?? 0,
    loggedIn,
    l10nJsJson: "{}",
  });

  const runnerProps = {
    quizDataJson: payload.quizData_json,
    dictionariesJson: payload.dictionaries_json,
    dbinfoJson: payload.dbinfo_json,
    l10nJson: payload.l10n_json,
    l10nJsJson: payload.l10n_js_json,
    typeinfoJson: payload.typeinfo_json,
    timeSeconds: payload.time_seconds,
    isUnlimited: payload.is_unlimited,
    numberSmallQuestions: payload.number_small_questions,
  };

  return (
    <main className="flex flex-1 flex-col items-center">
      <Suspense fallback={<p className="py-10 text-sm text-muted-foreground">Loading…</p>}>
        <QuizRunner
          {...runnerProps}
          isExam={examid !== undefined}
          examid={examid}
          exerciseLst={exerciseLst}
          quizName={quiz}
        />
      </Suspense>
    </main>
  );
}
