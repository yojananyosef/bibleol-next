"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";

/** Checkbox "include non-graded" que navega con el parámetro nongraded. */
export function NongradedToggle({ checked }: { checked: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => {
          const p = new URLSearchParams(params.toString());
          if (v) p.set("nongraded", "on");
          else p.delete("nongraded");
          router.push(`?${p.toString()}`);
        }}
      />
      Include non-graded quizzes
    </label>
  );
}
