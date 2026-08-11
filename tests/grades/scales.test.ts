import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateGrade, loadArrayOfGradeSchemes } from "../../src/lib/grades/scales.ts";

test("calc_grades_helper: percent", () => {
  assert.equal(calculateGrade("percent", 93.4), "93%");
  assert.equal(calculateGrade("percent", 99.6), "100%");
  assert.equal(calculateGrade("percent", 0), "0%");
});

test("calc_grades_helper: decimal", () => {
  assert.equal(calculateGrade("decimal", 93.4), 9.3);
  assert.equal(calculateGrade("decimal", 85), 8.5);
  assert.equal(calculateGrade("decimal", 0), 0);
});

test("calc_grades_helper: usletter", () => {
  assert.equal(calculateGrade("usletter", 95), "A");
  assert.equal(calculateGrade("usletter", 94.9), "A-");
  assert.equal(calculateGrade("usletter", 80), "B");
  assert.equal(calculateGrade("usletter", 65), "C");
  assert.equal(calculateGrade("usletter", 60), "C-");
  assert.equal(calculateGrade("usletter", 54.9), "F");
  assert.equal(calculateGrade("usletter", 200), -1); // fuera de rango
});

test("calc_grades_helper: german", () => {
  assert.equal(calculateGrade("german", 99), "1+");
  assert.equal(calculateGrade("german", 95), "1");
  assert.equal(calculateGrade("german", 70), "3");
  assert.equal(calculateGrade("german", 10), "5-");
  assert.equal(calculateGrade("german", 9.9), "6");
  assert.equal(calculateGrade("german", 0), "6");
});

test("calc_grades_helper: esquema desconocido → -1", () => {
  assert.equal(calculateGrade("no_such_scheme", 80), -1);
});

test("loadArrayOfGradeSchemes: 4 esquemas por defecto", () => {
  const schemes = loadArrayOfGradeSchemes();
  assert.deepEqual(
    schemes.map((s) => s.id),
    ["percent", "decimal", "usletter", "german"],
  );
  assert.equal(schemes[0].schemeType, "P");
  assert.equal(schemes[2].schemeType, "M");
  assert.ok(schemes[2].gradeScale.length > 0);
});
