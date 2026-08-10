import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ExamDonePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Exam finished</h1>
      <p className="text-sm text-muted-foreground">
        You have completed the exam. Results have been sent to your teacher.
      </p>
      <Link href="/quiz">
        <Button type="button">Select exercise</Button>
      </Link>
    </main>
  );
}
