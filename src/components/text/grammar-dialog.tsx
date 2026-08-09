"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GrammarInfoRow } from "@/lib/reader/grammar-info";

export interface GrammarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  rows: GrammarInfoRow[];
}

/** Diálogo con la información gramatical de un objeto (clickForGrammar). */
export function GrammarDialog({ open, onOpenChange, heading, rows }: GrammarDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, i) => {
              switch (row.kind) {
                case "head":
                  return (
                    <tr key={i}>
                      <td colSpan={2} className="py-1 text-base font-semibold">
                        {row.value}
                      </td>
                    </tr>
                  );
                case "visual":
                  return (
                    <tr key={i}>
                      <td className="whitespace-nowrap py-0.5 pr-3 text-muted-foreground">Visual</td>
                      <td className="py-0.5" dir="auto">
                        {row.value}
                      </td>
                    </tr>
                  );
                case "groupstart":
                  return (
                    <tr key={i}>
                      <td colSpan={2} className="pt-2 font-semibold">
                        {row.label}
                      </td>
                    </tr>
                  );
                case "groupend":
                  return null;
                case "feature":
                case "metafeature":
                  return (
                    <tr key={i}>
                      <td className="whitespace-nowrap py-0.5 pr-3 text-muted-foreground">{row.label}</td>
                      <td className="py-0.5" dir="auto">
                        {row.valueIsHtml ? (
                          <span dangerouslySetInnerHTML={{ __html: row.value }} />
                        ) : (
                          row.value
                        )}
                      </td>
                    </tr>
                  );
              }
            })}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
