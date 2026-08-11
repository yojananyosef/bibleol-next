/**
 * grades/scales.ts — Réplica 1:1 de `helpers/calc_grades_helper.php`.
 * Cálculo de notas a partir del porcentaje de aciertos.
 */

export type SchemeType = "P" | "D" | "M";

export interface GradeScaleItem {
  low: number;
  high: number;
  gradeSymbol: string;
}

export interface GradeScheme {
  id: string;
  schemeName: string;
  schemeType: SchemeType;
  gradeScale: GradeScaleItem[];
}

const USLETTER: GradeScaleItem[] = [
  { high: 101, low: 95, gradeSymbol: "A" },
  { high: 95, low: 90, gradeSymbol: "A-" },
  { high: 90, low: 85, gradeSymbol: "B+" },
  { high: 85, low: 80, gradeSymbol: "B" },
  { high: 80, low: 75, gradeSymbol: "B-" },
  { high: 75, low: 70, gradeSymbol: "C+" },
  { high: 70, low: 65, gradeSymbol: "C" },
  { high: 65, low: 60, gradeSymbol: "C-" },
  { high: 60, low: 55, gradeSymbol: "D" },
  { high: 55, low: -10, gradeSymbol: "F" },
];

const GERMAN: GradeScaleItem[] = [
  { high: 101, low: 99, gradeSymbol: "1+" },
  { high: 99, low: 95, gradeSymbol: "1" },
  { high: 95, low: 91, gradeSymbol: "1-" },
  { high: 91, low: 88, gradeSymbol: "2+" },
  { high: 88, low: 85, gradeSymbol: "2" },
  { high: 85, low: 81, gradeSymbol: "2-" },
  { high: 81, low: 78, gradeSymbol: "3+" },
  { high: 78, low: 70, gradeSymbol: "3" },
  { high: 70, low: 66, gradeSymbol: "3-" },
  { high: 66, low: 61, gradeSymbol: "4+" },
  { high: 61, low: 54, gradeSymbol: "4" },
  { high: 54, low: 50, gradeSymbol: "4-" },
  { high: 50, low: 40, gradeSymbol: "5+" },
  { high: 40, low: 20, gradeSymbol: "5" },
  { high: 20, low: 10, gradeSymbol: "5-" },
  { high: 10, low: -10, gradeSymbol: "6" },
];

/** createArrayOfGradeSchemes() — por ahora siempre los defaults. */
export function loadArrayOfGradeSchemes(): GradeScheme[] {
  return [
    { id: "percent", schemeName: "Percent", schemeType: "P", gradeScale: [] },
    { id: "decimal", schemeName: "Decimal", schemeType: "D", gradeScale: [] },
    { id: "usletter", schemeName: "US Letter", schemeType: "M", gradeScale: USLETTER },
    { id: "german", schemeName: "German", schemeType: "M", gradeScale: GERMAN },
  ];
}

export function getGradeSchemeById(id: string): GradeScheme | undefined {
  return loadArrayOfGradeSchemes().find((s) => s.id === id);
}

/**
 * calculateGrade(schemeID, percentage) — nota según SchemeType:
 * - 'P' (percent): round(pct) + "%"
 * - 'D' (decimal): round(pct/10, 1)
 * - 'M' (mnemónico): primer tramo [low, high) que contenga pct
 * Cualquier otro tipo o esquema inexistente → -1.
 */
export function calculateGrade(schemeId: string, percentage: number): string | number {
  const scheme = getGradeSchemeById(schemeId);
  if (!scheme) return -1;
  switch (scheme.schemeType) {
    case "P":
      return `${Math.round(percentage)}%`;
    case "D":
      return Math.round(percentage) / 10;
    case "M":
      for (const item of scheme.gradeScale) {
        if (percentage >= item.low && percentage < item.high) return item.gradeSymbol;
      }
      return -1;
    default:
      return -1;
  }
}
