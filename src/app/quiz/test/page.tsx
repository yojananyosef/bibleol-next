import { Suspense } from "react";
import { showTestQuiz, type ShowQuizPayload } from "@/lib/services/text-quiz";
import { checkTeacher } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { QuizRunner } from "@/components/quiz/QuizRunner";

export const dynamic = "force-dynamic";

interface TestQuizPageProps {
  searchParams: Promise<{
    quiz?: string;
    selection?: string;
  }>;
}

/**
 * /quiz/test — Ctrl_text::test_quiz (1:1): previsualiza el ejercicio recién
 * empaquetado por testQuizAction (package_test_quiz + set_owner + show_test_quiz
 * con number_of_quizzes = 5). Solo profesores.
 */
export default async function TestQuizPage({ searchParams }: TestQuizPageProps) {
  const params = await searchParams;
  const quiz = params.quiz ?? "";
  const selection = params.selection ? params.selection.split(",").filter((s) => s.length > 0) : null;

  const me = await checkTeacher();
  const loggedIn = users.isLoggedIn(me);
  const payload: ShowQuizPayload = showTestQuiz(quiz, 5, selection, {
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
          isExam={false}
          quizName={quiz}
        />
      </Suspense>
    </main>
  );
}