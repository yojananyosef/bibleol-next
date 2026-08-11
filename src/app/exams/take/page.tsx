import { redirect } from "next/navigation";
import { checkLoggedIn } from "@/lib/auth/guards";
import { takeExamData } from "@/lib/services/exams";

export const dynamic = "force-dynamic";

interface TakeExamPageProps {
  searchParams: Promise<{ exam?: string }>;
}

/**
 * /exams/take — Ctrl_exams::take_exam (1:1): valida acceso, persiste el
 * deadline en bol_exam_status y redirige al runner del primer ejercicio
 * pendiente (encadenado con exercise_lst). Si no quedan ejercicios → done.
 */
export default async function TakeExamPage({ searchParams }: TakeExamPageProps) {
  const { exam } = await searchParams;
  const me = await checkLoggedIn();
  const activeExamId = Number(exam ?? 0);

  if (!activeExamId) redirect("/exams/active");
  let data: { exercises: Array<{ name: string; numq: number }>; status: { deadline: number } };
  try {
    data = takeExamData(me, activeExamId);
  } catch {
    redirect("/exams/active");
    return;
  }
  if (data.exercises.length === 0) redirect("/exams/done");
  const first = data.exercises[0];
  const rest = data.exercises
    .slice(1)
    .map((x) => x.name)
    .join("~");
  redirect(
    `/quiz/run?quiz=${encodeURIComponent(first.name)}&count=${first.numq}&examid=${activeExamId}&exercise_lst=${encodeURIComponent(rest)}&deadline=${data.status.deadline}`,
  );
}