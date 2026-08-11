"use client";

import { Badge } from "@/components/ui/badge";

/**
 * table2csv/table2excel del legacy → export client-side de la tabla
 * con `id` (la tabla real, como `$("#grading_table")` en el legacy).
 */
export function ExportButtons({ filename, tableId }: { filename: string; tableId: string }) {
  function rows(): string[][] {
    const table = document.getElementById(tableId);
    if (!table) return [];
    const out: string[][] = [];
    for (const tr of table.querySelectorAll<HTMLTableRowElement>("tr")) {
      const cells: string[] = [];
      for (const td of tr.querySelectorAll("th,td")) {
        if (td.closest("[data-exclude]")) continue;
        cells.push((td as HTMLElement).innerText.trim());
      }
      if (cells.some((c) => c !== "")) out.push(cells);
    }
    return out;
  }

  function download(blob: Blob, ext: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toCsv(): string {
    return rows()
      .map((r) =>
        r
          .map((c) => {
            const s = c.replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      )
      .join("\n");
  }

  function toExcel(): string {
    const table = document.getElementById(tableId);
    if (!table) return "";
    const clone = table.cloneNode(true) as HTMLTableElement;
    for (const el of clone.querySelectorAll("[data-exclude]")) el.remove();
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${clone.outerHTML}</body></html>`;
    return html;
  }

  return (
    <span className="flex items-center gap-2">
      <Badge
        className="cursor-pointer select-none"
        onClick={(e) => {
          e.preventDefault();
          download(new Blob([toCsv()], { type: "text/csv;charset=utf-8," }), "csv");
        }}
      >
        CSV
      </Badge>
      <Badge
        className="cursor-pointer select-none"
        onClick={(e) => {
          e.preventDefault();
          download(
            new Blob([toExcel()], { type: "application/vnd.ms-excel;charset=utf-8" }),
            "xls",
          );
        }}
      >
        EXCEL
      </Badge>
    </span>
  );
}
