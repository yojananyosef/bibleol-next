// -*- js -*-
// monadobject.ts — port de BibleOL/ts/monadobject.ts (puro, sin DOM).

/** MonadPair: un rango de monads. */
export interface MonadPair {
  low: number;
  high: number;
}

/** MonadSet: conjunto de rangos de monads. */
export interface MonadSet {
  segments: MonadPair[];
}

/** MatchedObject: objeto Emdros cosechado de una consulta MQL. */
export interface MatchedObject {
  id_d: number;
  name: string;
  monadset: MonadSet;
  features: { [key: string]: unknown };
  sheaf: unknown;
}

/** MonadObject: MatchedObject + su lugar en la jerarquía. */
export interface MonadObject {
  mo: MatchedObject;
  children_idds: number[];
  parent?: MonadObject;
  displayers?: DisplayMonadObject[];
}

/** SingleMonadObject: objetos del nivel más bajo (words). */
export interface SingleMonadObject extends MonadObject {
  text: string;
  suffix: string;
  bcv: string[];
  bcv_loc: string;
  sameAsNext: boolean[];
  sameAsPrev: boolean[];
  pics: number[];
  urls: string[][];
}

/** MultipleMonadObject: objetos por encima del nivel más bajo. */
export interface MultipleMonadObject extends MonadObject {
  subobjects: MatchedObject[][];
}

import type { DisplayMonadObject } from "./displaymonadobject.ts";

/** Menor monad de un MonadSet. */
export function getFirst(ms: MonadSet): number {
  let first = 1000000000;
  for (const pc of ms.segments) if (pc.low < first) first = pc.low;
  return first;
}

/** Monad único de un MonadSet de un solo monad. */
export function getSingleInteger(ms: MonadSet): number {
  if (ms.segments.length === 1) {
    const p = ms.segments[0];
    if (p.low === p.high) return p.low;
  }
  throw "MonadSet.ObjNotSingleMonad";
}

export function containsMonad(ms: MonadSet, monad: number): boolean {
  for (const mp of ms.segments) if (monad >= mp.low && monad <= mp.high) return true;
  return false;
}

export function getMonadArray(ms: MonadSet): number[] {
  const res: number[] = [];
  for (const mp of ms.segments) for (let j = mp.low; j <= mp.high; ++j) res.push(j);
  return res;
}

/** Parsea un monadset MQL "{ 1-39, 45-47 }" (formato del servidor) a MonadSet. */
export function parseMonadSet(s: string): MonadSet {
  const ms: MonadSet = { segments: [] };
  const re = /(\d+)\s*-\s*(\d+)|(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) ms.segments.push({ low: +m[1], high: +m[2] });
    else ms.segments.push({ low: +m[3], high: +m[3] });
  }
  return ms;
}
